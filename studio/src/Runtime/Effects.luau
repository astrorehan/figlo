--!strict
-- FrameFig effects: brings the Figma name tags to life in game.
--
-- Every tagged layer carries FF_<tag> = true plus its values as FF_<tag>_<key>
-- (set in the Figma plugin's Effects tab, editable in Studio). Missing values
-- fall back to the defaults below, which match the Figma plugin's.

local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Effects = {}

local DEFAULTS = {
	button = { hoverDim = 0.8, pressDim = 0.62 },
	-- Sounds: free Creator Store audio; set the id to 0 (or empty) for silence.
	smooth = { hover = 1.08, press = 0.9, time = 0.15, hoverSound = "139800881181209", clickSound = "102702078778790" },
	shiny = { time = 0.7, cooldown = 2, width = 0.32, opacity = 0.9, angle = 25 },
	gleam = { time = 0.8, cooldown = 2, width = 0.22 },
	drift = { speed = 40, angle = 270 },
	rays = { speed = 20, amp = 0.06, rate = 0.5 },
	spin = { speed = 90 },
	pulse = { amp = 0.05, rate = 1 },
	float = { amp = 0.06, rate = 0.45 },
	blink = { rate = 0.7, min = 0.55, fade = 0.7 },
	wiggle = { every = 4, time = 0.7, angle = 10 },
	pop = { from = 0.8, time = 0.3 },
}

-- The layer plus the images FrameFig split off it (drop shadow, baked background),
-- so motion moves the whole look, not just the live part.
local function companions(obj: Instance): { Instance }
	local list = { obj }
	local id = obj:GetAttribute("FF_Id")
	local parent = obj.Parent
	if id and parent then
		for _, sib in parent:GetChildren() do
			local sid = sib:GetAttribute("FF_Id")
			if sid == id .. ":shadow" or sid == id .. ":bg" then
				table.insert(list, sib)
			end
		end
	end
	return list
end

local function param(obj: Instance, tag: string, key: string): any
	local v = obj:GetAttribute(("FF_%s_%s"):format(tag, key))
	local def = (DEFAULTS :: any)[tag][key]
	if typeof(v) ~= typeof(def) then
		return def
	end
	return v
end

type Tick = (dt: number) -> ()

-- --- buttons -----------------------------------------------------------------

local function sound(id: string, parent: Instance): Sound?
	id = tostring(id):gsub("%s", "")
	if id == "" or id == "0" then
		return nil
	end
	if not id:find("^rbxassetid://") then
		id = "rbxassetid://" .. id
	end
	local s = Instance.new("Sound")
	s.Name = "FF_Sound"
	s.SoundId = id
	s.Parent = parent
	return s
end

-- Press state that also ends when the mouse is released off the button.
local function onPress(btn: GuiButton, changed: (hovering: boolean, held: boolean) -> ())
	local hovering, held = false, false
	btn.MouseEnter:Connect(function()
		hovering = true
		changed(hovering, held)
	end)
	btn.MouseLeave:Connect(function()
		hovering = false
		changed(hovering, held)
	end)
	btn.MouseButton1Down:Connect(function()
		held = true
		changed(hovering, held)
	end)
	UserInputService.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if held and (t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch) then
			held = false
			changed(hovering, held)
		end
	end)
end

local function smooth(btn: GuiButton, runtime: any)
	local hoverK = param(btn, "smooth", "hover")
	local pressK = param(btn, "smooth", "press")
	local time = param(btn, "smooth", "time")
	local hoverSound = sound(param(btn, "smooth", "hoverSound"), btn)
	local clickSound = sound(param(btn, "smooth", "clickSound"), btn)

	local value = Instance.new("NumberValue")
	value.Value = 1
	local parts = companions(btn)
	value.Changed:Connect(function(v)
		for _, o in parts do
			runtime.setFxScale(o, v)
		end
	end)
	local tween: Tween? = nil
	local wasHovering = false
	onPress(btn, function(hovering, held)
		if hovering and not wasHovering and hoverSound then
			SoundService:PlayLocalSound(hoverSound)
		end
		wasHovering = hovering
		local target, t = 1, time
		if held then
			target, t = pressK, time * 0.5
		elseif hovering then
			target = hoverK
		end
		if tween then
			tween:Cancel()
		end
		tween = TweenService:Create(value, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = target })
		tween:Play()
	end)
	if clickSound then
		btn.MouseButton1Down:Connect(function()
			SoundService:PlayLocalSound(clickSound)
		end)
	end
end

-- Plain button: darken its pictures (or its fill) on hover and press.
local function dim(btn: GuiButton)
	local targets: { { obj: any, prop: string, base: Color3 } } = {}
	local function add(obj: any, prop: string)
		table.insert(targets, { obj = obj, prop = prop, base = obj[prop] })
	end
	if btn:IsA("ImageButton") and btn.Image ~= "" then
		add(btn, "ImageColor3")
	end
	if btn.BackgroundTransparency < 1 then
		add(btn, "BackgroundColor3")
	end
	for _, d in btn:GetDescendants() do
		if (d:IsA("ImageLabel") or d:IsA("ImageButton")) and not d:GetAttribute("FF_nodim") then
			add(d, "ImageColor3")
		end
	end
	if #targets == 0 then
		btn.AutoButtonColor = true
		return
	end
	local hoverDim = param(btn, "button", "hoverDim")
	local pressDim = param(btn, "button", "pressDim")
	onPress(btn, function(hovering, held)
		local k = if held then pressDim elseif hovering then hoverDim else 1
		for _, t in targets do
			local c = t.base
			TweenService:Create(t.obj, TweenInfo.new(0.08), { [t.prop] = Color3.new(c.R * k, c.G * k, c.B * k) }):Play()
		end
	end)
end

-- --- gleam: a white copy of the text, lit only inside a moving band -----------

local GLEAM_TILT = 18

local function band(width: number, peak: number): NumberSequence
	local h = math.clamp(width / 2, 0.03, 0.45)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.5 - h, 1),
		NumberSequenceKeypoint.new(0.5 - h * 0.5, 1 - (1 - peak) * 0.5),
		NumberSequenceKeypoint.new(0.5, peak),
		NumberSequenceKeypoint.new(0.5 + h * 0.5, 1 - (1 - peak) * 0.5),
		NumberSequenceKeypoint.new(0.5 + h, 1),
		NumberSequenceKeypoint.new(1, 1),
	})
end

-- --- shiny: a light band sweeps across the layer's own shape -------------------
-- A white copy of the shape (same rounded corners) sits over the layer's fill but
-- under anything drawn inside it; a UIGradient keeps it transparent except a band.

-- A drawn shine (an image, e.g. a diagonal stripe inside a clipped button) is
-- replaced by a soft tilted gradient band that sweeps left to right across its
-- parent, then rests out of sight. The band lives on a square frame (as wide as
-- the parent, cut by the parent's clip) so the gradient's tilt is true in pixels.
local function sweep(obj: GuiObject): Tick
	local time = math.max(0.05, param(obj, "shiny", "time"))
	local cooldown = param(obj, "shiny", "cooldown")
	local width = param(obj, "shiny", "width")
	local opacity = param(obj, "shiny", "opacity")
	local angle = param(obj, "shiny", "angle")

	local light = Instance.new("Frame")
	light.Name = "FF_Shine"
	light.BorderSizePixel = 0
	light.BackgroundColor3 = Color3.new(1, 1, 1)
	light.AnchorPoint = Vector2.new(0.5, 0.5)
	light.Position = UDim2.fromScale(0.5, 0.5)
	light.Size = UDim2.fromScale(1, 1)
	light.ZIndex = obj.ZIndex
	light.Visible = false
	light.SizeConstraint = Enum.SizeConstraint.RelativeXX
	local g = Instance.new("UIGradient")
	g.Transparency = band(width, 1 - opacity)
	g.Rotation = angle
	g.Parent = light
	light.Parent = obj.Parent
	obj.Visible = false
	-- the band starts and ends fully outside, whatever its tilt
	local span = 0.5 + width + math.abs(math.sin(math.rad(angle))) * 0.5

	local t = math.random() * (time + cooldown)
	return function(dt)
		t = (t + dt) % (time + cooldown)
		local live = t < time
		if live then
			local u = t / time
			u = if u < 0.5 then 2 * u * u else 1 - (-2 * u + 2) ^ 2 / 2
			g.Offset = Vector2.new(-span + u * span * 2, 0)
		end
		if light.Visible ~= live then
			light.Visible = live
		end
	end
end

local function shiny(obj: GuiObject): Tick?
	if obj:IsA("ImageLabel") or obj:IsA("ImageButton") then
		return sweep(obj)
	end
	if obj:IsA("TextLabel") or obj.BackgroundTransparency >= 1 then
		warn("[FrameFig] _shiny needs a shape layer (rectangle or frame with a fill): " .. obj:GetFullName())
		return nil
	end
	local time = math.max(0.05, param(obj, "shiny", "time"))
	local cooldown = param(obj, "shiny", "cooldown")
	local width = param(obj, "shiny", "width")
	local opacity = param(obj, "shiny", "opacity")
	local angle = param(obj, "shiny", "angle")

	local light = Instance.new("Frame")
	light.Name = "FF_Shine"
	light.BorderSizePixel = 0
	light.BackgroundColor3 = Color3.new(1, 1, 1)
	light.AnchorPoint = Vector2.new(0.5, 0.5)
	light.Position = UDim2.fromScale(0.5, 0.5)
	light.Size = UDim2.fromScale(1, 1)
	light.ZIndex = 0
	light.Visible = false
	local corner = obj:FindFirstChildWhichIsA("UICorner")
	if corner then
		corner:Clone().Parent = light
	end
	local g = Instance.new("UIGradient")
	g.Transparency = band(width, 1 - opacity)
	g.Rotation = angle
	g.Parent = light
	light.Parent = obj
	-- the band starts and ends fully outside, whatever its tilt
	local span = 0.5 + width + math.abs(math.sin(math.rad(angle))) * 0.5

	local t = 0
	return function(dt)
		t = (t + dt) % (time + cooldown)
		local live = t < time
		if live then
			g.Offset = Vector2.new(-span + (t / time) * span * 2, 0)
		end
		if light.Visible ~= live then
			light.Visible = live
		end
	end
end

local function gleam(label: TextLabel, gui: Instance, runtime: any): Tick?
	if not (label:IsA("TextLabel") or label:IsA("TextButton")) then
		warn("[FrameFig] _gleam works on text layers: " .. label:GetFullName())
		return nil
	end
	local time = math.max(0.05, param(label, "gleam", "time"))
	local cooldown = param(label, "gleam", "cooldown")
	local width = param(label, "gleam", "width")
	local stroke = label:FindFirstChildWhichIsA("UIStroke")
	local tilt = if label.AbsoluteSize.Y > label.AbsoluteSize.X * 0.3 then GLEAM_TILT else 0

	-- extra: outline in design px added around the glyphs (the halo is wider and fainter)
	local function copy(z: number, bandWidth: number, peak: number, extra: number)
		local c = Instance.new("TextLabel")
		c.Name = "FF_Gleam"
		c.BackgroundTransparency = 1
		c.AnchorPoint = Vector2.new(0.5, 0.5)
		c.Position = UDim2.fromScale(0.5, 0.5)
		c.Size = UDim2.fromScale(1, 1)
		c.Text = label.Text
		c.FontFace = label.FontFace
		c.TextSize = label.TextSize
		c.LineHeight = label.LineHeight
		c.TextWrapped = label.TextWrapped
		c.TextXAlignment = label.TextXAlignment
		c.TextYAlignment = label.TextYAlignment
		c.TextColor3 = Color3.new(1, 1, 1)
		c.ZIndex = label.ZIndex + z
		c.Visible = false
		local s: UIStroke? = nil
		if stroke or extra > 0 then
			s = Instance.new("UIStroke")
			local st = s :: UIStroke
			st.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
			st.LineJoinMode = Enum.LineJoinMode.Round
			st.Color = Color3.new(1, 1, 1)
			st.Parent = c
		end
		local g = Instance.new("UIGradient")
		g.Transparency = band(bandWidth, peak)
		g.Rotation = tilt
		g.Parent = c
		c.Parent = label
		return { label = c, stroke = s, grad = g, extra = extra }
	end
	local layers = {
		copy(1, width * 1.7, 0.55, 3),
		copy(2, width, 0, 0),
	}

	local t = 0
	local wasLive = false
	return function(dt)
		t = (t + dt) % (time + cooldown)
		local live = t < time
		if live then
			local k = runtime.scaleFactor(gui) or 1
			local s = label:GetAttribute("FF_TextScale") or 1
			local span = 0.5 + width
			local offset = -span + (t / time) * span * 2
			for _, l in layers do
				l.label.TextSize = label.TextSize
				l.grad.Offset = Vector2.new(offset, 0)
				if l.stroke then
					local base = if stroke then stroke.Thickness else 0
					l.stroke.Thickness = base + l.extra * k / s
				end
			end
		end
		if live ~= wasLive then
			wasLive = live
			for _, l in layers do
				l.label.Visible = live
			end
		end
	end
end

-- --- drift: a tiled picture scrolling forever -------------------------------

local function drift(image: ImageLabel, gui: Instance, runtime: any): Tick?
	if not image:IsA("ImageLabel") or image.ScaleType ~= Enum.ScaleType.Tile then
		warn("[FrameFig] _drift needs a tiled image fill: " .. image:GetFullName())
		return nil
	end
	local tx, ty = image.TileSize.X.Scale, image.TileSize.Y.Scale
	if tx <= 0 or ty <= 0 then
		return nil
	end
	-- A clip frame takes the image's place; inside it the image is one tile larger on
	-- every side, so sliding by up to one tile never shows an edge.
	local clip = Instance.new("Frame")
	clip.Name = image.Name
	clip.BackgroundTransparency = 1
	clip.BorderSizePixel = 0
	clip.ClipsDescendants = true
	clip.AnchorPoint = image.AnchorPoint
	clip.Position = image.Position
	clip.Size = image.Size
	clip.Rotation = image.Rotation
	clip.ZIndex = image.ZIndex
	clip.Parent = image.Parent
	image.Name = "Tiles"
	image.AnchorPoint = Vector2.new(0.5, 0.5)
	image.Position = UDim2.fromScale(0.5, 0.5)
	image.Rotation = 0
	image.Size = UDim2.fromScale(1 + 2 * tx, 1 + 2 * ty)
	image.TileSize = UDim2.fromScale(tx / (1 + 2 * tx), ty / (1 + 2 * ty))
	image.Parent = clip

	local speed = param(image, "drift", "speed")
	local angle = math.rad(param(image, "drift", "angle"))
	local dx, dy = math.sin(angle), -math.cos(angle)
	-- Distance from the shared clock, not from summed ticks: a hidden layer is not
	-- ticked, so two copies of one pattern (tabs that swap) would drift apart.
	return function()
		local travelled = speed * (runtime.scaleFactor(gui) or 1) * os.clock()
		local tw, th = tx * clip.AbsoluteSize.X, ty * clip.AbsoluteSize.Y
		if tw < 0.5 or th < 0.5 then
			return
		end
		image.Position = UDim2.new(0.5, (dx * travelled) % tw, 0.5, (dy * travelled) % th)
	end
end

-- --- idle motion and entrances ----------------------------------------------------
-- Every layer gets its own random phase so rows of identical cards never move in step.

local TAU = math.pi * 2

local function randomPhase(): number
	return math.random() * TAU
end

local function setScale(parts: { Instance }, runtime: any, k: number, channel: string)
	for _, o in parts do
		runtime.setFxScale(o, k, channel)
	end
end

local function setRotation(parts: { Instance }, bases: { number }, offset: number)
	for i, o in parts do
		local g: any = o
		g.Rotation = bases[i] + offset
	end
end

local function rotations(parts: { Instance }): { number }
	local bases = {}
	for i, o in parts do
		bases[i] = (o :: GuiObject).Rotation
	end
	return bases
end

-- rays: square bursts turn forever; wide ones (a burst cut to a card) swing
-- instead, so their corners never sweep into view.
local function rays(obj: GuiObject, runtime: any): Tick
	local speed = param(obj, "rays", "speed")
	local amp = param(obj, "rays", "amp")
	local rate = param(obj, "rays", "rate")
	local parts = companions(obj)
	local bases = rotations(parts)
	local size = obj:GetAttribute("FF_DesignSize")
	if typeof(size) ~= "Vector2" then
		size = obj.AbsoluteSize
	end
	local ratio = if size.Y > 0 then size.X / size.Y else 1
	local square = ratio < 1.3 and ratio > 1 / 1.3
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		local rot = if square then (t * speed) % 360 else 8 * math.sin(t * TAU * 0.12 + ph)
		setRotation(parts, bases, rot)
		setScale(parts, runtime, 1 + amp * (0.5 - 0.5 * math.cos(t * rate * TAU + ph)), "idle")
	end
end

local function spin(obj: GuiObject): Tick
	local speed = param(obj, "spin", "speed")
	local parts = companions(obj)
	local bases = rotations(parts)
	local t = 0
	return function(dt)
		t += dt
		setRotation(parts, bases, (t * speed) % 360)
	end
end

local function pulse(obj: GuiObject, runtime: any): Tick
	local amp = param(obj, "pulse", "amp")
	local rate = param(obj, "pulse", "rate")
	local parts = companions(obj)
	local t = 0
	return function(dt)
		t += dt
		setScale(parts, runtime, 1 + amp * (0.5 - 0.5 * math.cos(t * rate * TAU)), "idle")
	end
end

local function float(obj: GuiObject): Tick
	local amp = param(obj, "float", "amp")
	local rate = param(obj, "float", "rate")
	local parts = companions(obj)
	local bases = {}
	for i, o in parts do
		bases[i] = (o :: GuiObject).Position
	end
	-- amp is a share of the layer's own height, expressed in parent Scale units
	local lift = amp * obj.Size.Y.Scale
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		local dy = -lift * math.sin(t * rate * TAU + ph)
		for i, o in parts do
			local b = bases[i]
			local g: any = o
			g.Position = UDim2.new(b.X.Scale, b.X.Offset, b.Y.Scale + dy, b.Y.Offset)
		end
	end
end

local function blink(obj: GuiObject, runtime: any): Tick
	local rate = param(obj, "blink", "rate")
	local low = param(obj, "blink", "min")
	local fade = param(obj, "blink", "fade")
	local image = obj:IsA("ImageLabel") or obj:IsA("ImageButton")
	local baseT = if image then (obj :: any).ImageTransparency else 0
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		-- sharp twinkle: long bright rest, quick dip
		local s = (0.5 + 0.5 * math.cos(t * rate * TAU + ph)) ^ 0.6
		runtime.setFxScale(obj, low + (1 - low) * s, "idle")
		if image then
			local img: any = obj
			img.ImageTransparency = baseT + (1 - baseT) * fade * (1 - s)
		end
	end
end

local function wiggle(obj: GuiObject): Tick
	local every = math.max(0.1, param(obj, "wiggle", "every"))
	local time = math.min(every, param(obj, "wiggle", "time"))
	local angle = param(obj, "wiggle", "angle")
	local parts = companions(obj)
	local bases = rotations(parts)
	local t = math.random() * every
	local resting = true
	return function(dt)
		t = (t + dt) % every
		if t < time then
			local u = t / time
			setRotation(parts, bases, angle * math.exp(-4 * u) * math.sin(u * TAU * 3))
			resting = false
		elseif not resting then
			setRotation(parts, bases, 0)
			resting = true
		end
	end
end

-- Shown on screen: every GuiObject up the chain visible and the ScreenGui enabled.
-- Folders are passed through: a merged gui keeps each imported page in a Folder.
local function shown(obj: Instance): boolean
	local o: Instance? = obj
	while o do
		if o:IsA("LayerCollector") then
			return o.Enabled
		elseif o:IsA("GuiObject") and not o.Visible then
			return false
		end
		o = o.Parent
	end
	return true
end

local function pop(obj: GuiObject, runtime: any): Tick
	local from = param(obj, "pop", "from")
	local time = math.max(0.01, param(obj, "pop", "time"))
	local parts = companions(obj)
	local value = Instance.new("NumberValue")
	value.Value = 1
	value.Changed:Connect(function(v)
		setScale(parts, runtime, v, "pop")
	end)
	local was = false
	return function()
		local now = shown(obj)
		if now and not was then
			value.Value = from
			TweenService:Create(value, TweenInfo.new(time, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Value = 1 }):Play()
		end
		was = now
	end
end

local IDLE: { [string]: (GuiObject, any) -> Tick } = {
	rays = rays,
	spin = spin,
	pulse = pulse,
	float = float,
	blink = blink,
	wiggle = wiggle,
	pop = pop,
}

-- --- start ---------------------------------------------------------------------

function Effects.start(gui: Instance, runtime: any)
	if not RunService:IsRunning() then
		return
	end
	local ticks: { Tick } = {}
	-- pop has to see the page hide to replay on the next show, so it runs hidden too
	local watchers: { Tick } = {}
	local function try(obj: Instance, name: string, fn: () -> Tick?)
		local ok, result = pcall(fn)
		if not ok then
			warn(("[FrameFig] _%s on %s: %s"):format(name, obj:GetFullName(), tostring(result)))
		elseif result then
			table.insert(if name == "pop" then watchers else ticks, result)
		end
	end
	for _, obj in gui:GetDescendants() do
		if obj:IsA("GuiButton") and obj:GetAttribute("FF_button") then
			local btn = obj :: GuiButton
			if btn:GetAttribute("FF_smooth") then
				try(btn, "smooth", function()
					smooth(btn, runtime)
					return nil
				end)
			else
				try(btn, "button", function()
					dim(btn)
					return nil
				end)
			end
		end
		if obj:IsA("GuiObject") then
			if obj:GetAttribute("FF_shiny") then
				try(obj, "shiny", function()
					return shiny(obj :: GuiObject)
				end)
			end
			if obj:GetAttribute("FF_gleam") then
				try(obj, "gleam", function()
					return gleam(obj :: any, gui, runtime)
				end)
			end
			if obj:GetAttribute("FF_drift") then
				try(obj, "drift", function()
					return drift(obj :: any, gui, runtime)
				end)
			end
			for tag, fn in IDLE do
				if obj:GetAttribute("FF_" .. tag) then
					try(obj, tag, function()
						return fn(obj :: GuiObject, runtime)
					end)
				end
			end
		end
	end
	if #ticks == 0 and #watchers == 0 then
		return
	end
	-- gui is the ScreenGui, or a Folder holding one page of a merged gui
	local root = gui:FindFirstChild(gui:GetAttribute("FF_Root") or "")
	local failed = false
	RunService.RenderStepped:Connect(function(dt)
		for _, watch in watchers do
			pcall(watch, dt)
		end
		if not shown(root or gui) then
			return
		end
		for _, tick in ticks do
			local ok, err = pcall(tick, dt)
			if not ok and not failed then
				failed = true
				warn("[FrameFig] effect error: " .. tostring(err))
			end
		end
	end)
end

return Effects
