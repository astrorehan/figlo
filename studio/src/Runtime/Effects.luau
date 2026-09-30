--!strict
-- FrameFig effects: brings the Figma name tags to life in game.
--
-- Every tagged layer carries FF_<tag> = true (or the value after the colon, as in
-- `_goto:Shop`) plus its values as FF_<tag>_<key> (set in the Figma plugin's
-- Effects tab, editable in Studio). Missing values fall back to the defaults
-- below, which match the Figma plugin's.

local GuiService = game:GetService("GuiService")
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
	sway = { angle = 6, rate = 0.4 },
	wobble = { amp = 0.05, rate = 1.2 },
	jitter = { every = 3, time = 0.35, amount = 0.04 },
	halo = { color = "FFFFFF", size = 6, rate = 0.8, low = 0.15, high = 0.7 },
	tide = { amp = 0.3, rate = 0.25, turn = 0 },
	lift = { amount = 0.08, time = 0.15 },
	tip = { angle = 6, time = 0.15 },
	pull = { strength = 0.12, time = 0.12 },
	sheen = { time = 0.5, width = 0.3, opacity = 0.6, angle = 20 },
	splash = { color = "FFFFFF", opacity = 0.35, time = 0.45 },
	fade = { time = 0.35 },
	slide = { distance = 0.25, angle = 180, time = 0.4 },
	stagger = { gap = 0.06, from = 0, time = 0.25 },
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

local function color(obj: Instance, tag: string): Color3
	local ok, c = pcall(Color3.fromHex, (tostring(param(obj, tag, "color")):gsub("[#%s]", "")))
	return if ok then c else Color3.new(1, 1, 1)
end

type Tick = (dt: number) -> ()

local TAU = math.pi * 2

-- Share of the way to a target after dt, for an ease that settles in about `time`.
local function ease(dt: number, time: number): number
	return 1 - math.exp(-dt * 4 / math.max(0.01, time))
end

local function randomPhase(): number
	return math.random() * TAU
end

local function setScale(parts: { Instance }, runtime: any, k: number, channel: string)
	for _, o in parts do
		runtime.setFxScale(o, k, channel)
	end
end

local function setOffset(parts: { Instance }, runtime: any, x: number, y: number, channel: string)
	for _, o in parts do
		runtime.setFxOffset(o, x, y, channel)
	end
end

local function setRotation(parts: { Instance }, runtime: any, degrees: number, channel: string)
	for _, o in parts do
		runtime.setFxRotation(o, degrees, channel)
	end
end

-- Pixel size of what the object's Scale position is measured against.
local function parentPixels(obj: GuiObject): Vector2
	local p = obj.Parent
	if p and p:IsA("GuiObject") then
		return p.AbsoluteSize
	end
	local lc = obj:FindFirstAncestorWhichIsA("LayerCollector")
	if lc then
		return (lc :: any).AbsoluteSize
	end
	return obj.AbsoluteSize
end

-- Pointer position relative to the object's centre, in screen pixels.
local function pointerFrom(obj: GuiObject): Vector2
	local m = UserInputService:GetMouseLocation()
	local sg = obj:FindFirstAncestorWhichIsA("ScreenGui")
	if sg and not sg.IgnoreGuiInset then
		m -= GuiService:GetGuiInset()
	end
	return m - (obj.AbsolutePosition + obj.AbsoluteSize / 2)
end

-- --- pointer state ---------------------------------------------------------------
-- One record per button (or hovered layer), shared by every effect that reacts to
-- it. A press also ends when the pointer is released off the button. Code sets
-- the attribute FF_Locked = true to lock a button: its effects stop reacting and
-- `_when:locked` layers show. `_goto` buttons get FF_Active while their page shows.

type Press = { hover: boolean, held: boolean, listeners: { () -> () } }

local presses: { [Instance]: Press } = setmetatable({}, { __mode = "k" }) :: any

local function locked(obj: Instance): boolean
	return obj:GetAttribute("FF_Locked") == true
end

local function isPress(input: InputObject): boolean
	local t = input.UserInputType
	return t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch
end

local function pressOf(obj: GuiObject): Press
	local existing = presses[obj]
	if existing then
		return existing
	end
	local st: Press = { hover = false, held = false, listeners = {} }
	presses[obj] = st
	local function changed()
		for _, fn in st.listeners do
			local ok, err = pcall(fn)
			if not ok then
				warn("[FrameFig] " .. tostring(err))
			end
		end
	end
	obj.MouseEnter:Connect(function()
		st.hover = true
		changed()
	end)
	obj.MouseLeave:Connect(function()
		st.hover = false
		changed()
	end)
	if obj:IsA("GuiButton") then
		obj.MouseButton1Down:Connect(function()
			st.held = true
			changed()
		end)
	else
		obj.InputBegan:Connect(function(input)
			if isPress(input) then
				st.held = true
				changed()
			end
		end)
	end
	UserInputService.InputEnded:Connect(function(input)
		if st.held and isPress(input) then
			st.held = false
			changed()
		end
	end)
	obj:GetAttributeChangedSignal("FF_Locked"):Connect(changed)
	obj:GetAttributeChangedSignal("FF_Active"):Connect(changed)
	return st
end

local function listen(obj: GuiObject, fn: () -> ()): Press
	local st = pressOf(obj)
	table.insert(st.listeners, fn)
	return st
end

-- The button a layer belongs to (itself included), or the layer when it has none.
local function hoverSource(obj: GuiObject): GuiObject
	local o: Instance? = obj
	while o and not o:IsA("LayerCollector") do
		if o:IsA("GuiButton") then
			return o
		end
		o = o.Parent
	end
	return obj
end

local function buttonAbove(obj: Instance): GuiButton?
	local o = obj.Parent
	while o and not o:IsA("LayerCollector") do
		if o:IsA("GuiButton") then
			return o
		end
		o = o.Parent
	end
	return nil
end

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
		setScale(parts, runtime, v, "button")
	end)
	local tween: Tween? = nil
	local wasHovering = false
	local st: Press
	st = listen(btn, function()
		local off = locked(btn)
		local hovering, held = st.hover and not off, st.held and not off
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
			if not locked(btn) then
				SoundService:PlayLocalSound(clickSound)
			end
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
	local st: Press
	st = listen(btn, function()
		local off = locked(btn)
		local k = if st.held and not off then pressDim elseif st.hover and not off then hoverDim else 1
		for _, t in targets do
			local c = t.base
			TweenService:Create(t.obj, TweenInfo.new(0.08), { [t.prop] = Color3.new(c.R * k, c.G * k, c.B * k) }):Play()
		end
	end)
end

-- `_when:hover` (or press, rest, locked, active; several as hover|press): the layer
-- shows only while the button it sits in is in that state. One state at a time,
-- first match wins: locked, active, press, hover, rest.
local function stateName(btn: GuiButton, st: Press): string
	if locked(btn) then
		return "locked"
	elseif btn:GetAttribute("FF_Active") == true then
		return "active"
	elseif st.held then
		return "press"
	elseif st.hover then
		return "hover"
	end
	return "rest"
end

local STATES = { hover = true, press = true, rest = true, locked = true, active = true }

local function whenState(obj: GuiObject)
	local want = obj:GetAttribute("FF_when")
	if type(want) ~= "string" then
		warn("[FrameFig] _when needs a state, e.g. _when:hover: " .. obj:GetFullName())
		return
	end
	local set = {}
	for word in want:lower():gmatch("%a+") do
		if not STATES[word] then
			warn(("[FrameFig] _when: unknown state %q on %s (hover, press, rest, locked, active)"):format(word, obj:GetFullName()))
		end
		set[word] = true
	end
	local btn = buttonAbove(obj)
	if not btn then
		warn("[FrameFig] _when must sit inside a button: " .. obj:GetFullName())
		return
	end
	local b = btn :: GuiButton
	local st: Press
	local function update()
		obj.Visible = set[stateName(b, st)] == true
	end
	st = listen(b, update)
	update()
end

-- --- navigation: _goto, _show, _hide, _switch ----------------------------------------
-- Names are looked up in the button's ScreenGui: a page (a Folder imported with
-- "Import as page", or the ScreenGui's own frame), then any layer of that name; then
-- another ScreenGui beside it, named as given or FrameFig_<name>.

type Target = { kind: string, inst: Instance }

local function screenOf(obj: Instance): LayerCollector?
	return obj:FindFirstAncestorWhichIsA("LayerCollector")
end

local function pagesIn(sg: Instance): { { container: Instance, root: GuiObject } }
	local list = {}
	local function add(container: Instance)
		local root = container:FindFirstChild(container:GetAttribute("FF_Root") or "")
		if root and root:IsA("GuiObject") then
			table.insert(list, { container = container, root = root })
		end
	end
	add(sg)
	for _, d in sg:GetDescendants() do
		if d:IsA("Folder") and d:GetAttribute("FF_Root") then
			add(d)
		end
	end
	return list
end

local function resolve(from: Instance, name: string): Target?
	local sg = screenOf(from)
	if not sg then
		return nil
	end
	for _, page in pagesIn(sg) do
		if page.container.Name == name or page.root.Name == name then
			return { kind = "page", inst = page.root }
		end
	end
	local found = sg:FindFirstChild(name, true)
	if found and found:IsA("GuiObject") then
		return { kind = "layer", inst = found }
	end
	local holder = sg.Parent
	if holder then
		local other = holder:FindFirstChild(name) or holder:FindFirstChild("FrameFig_" .. name)
		if other and other:IsA("LayerCollector") then
			return { kind = "gui", inst = other }
		end
	end
	return nil
end

local function isShown(t: Target): boolean
	if t.kind == "gui" then
		return (t.inst :: LayerCollector).Enabled
	end
	return (t.inst :: GuiObject).Visible
end

local function setShown(t: Target, on: boolean)
	if t.kind == "gui" then
		(t.inst :: LayerCollector).Enabled = on
	else
		(t.inst :: GuiObject).Visible = on
	end
end

local function gotoTarget(btn: GuiButton, name: string)
	local t = resolve(btn, name)
	if not t then
		warn(("[FrameFig] _goto: nothing named %q near %s"):format(name, btn:GetFullName()))
		return
	end
	local sg = screenOf(btn) :: LayerCollector
	if t.kind == "page" then
		for _, page in pagesIn(sg) do
			page.root.Visible = page.root == t.inst
		end
		sg:SetAttribute("FF_Page", name)
	elseif t.kind == "layer" then
		-- Hide the other `_goto` targets that share its parent (tabs inside one panel).
		for _, d in sg:GetDescendants() do
			local other = d:GetAttribute("FF_goto")
			if type(other) == "string" and other ~= name then
				local o = resolve(d, other)
				if o and o.kind == "layer" and o.inst.Parent == t.inst.Parent then
					setShown(o, false)
				end
			end
		end
	end
	setShown(t, true)
end

local function navigation(btn: GuiButton)
	local function value(tag: string): string?
		local v = btn:GetAttribute("FF_" .. tag)
		return if type(v) == "string" and v ~= "" then v else nil
	end
	local gotoName, showName, switchName = value("goto"), value("show"), value("switch")
	local hides = btn:GetAttribute("FF_hide") ~= nil and btn:GetAttribute("FF_hide") ~= false
	local hideName = value("hide")
	btn.Activated:Connect(function()
		if locked(btn) then
			return
		end
		if gotoName then
			gotoTarget(btn, gotoName)
		end
		for _, pair in { { showName, true }, { switchName, false } } do
			local name = pair[1] :: string?
			if name then
				local t = resolve(btn, name)
				if t then
					setShown(t, if pair[2] then true else not isShown(t))
				else
					warn(("[FrameFig] nothing named %q near %s"):format(name, btn:GetFullName()))
				end
			end
		end
		if hides then
			if hideName then
				local t = resolve(btn, hideName)
				if t then
					setShown(t, false)
				else
					warn(("[FrameFig] _hide: nothing named %q near %s"):format(hideName, btn:GetFullName()))
				end
			else
				local sg = screenOf(btn)
				if sg then
					sg.Enabled = false
				end
			end
		end
	end)
	if gotoName then
		-- FF_Active follows the target, however it gets shown (this button, another,
		-- or game code), so `_when:active` layers stay right.
		local t = resolve(btn, gotoName)
		if t then
			local function update()
				btn:SetAttribute("FF_Active", isShown(t))
			end
			t.inst:GetPropertyChangedSignal(if t.kind == "gui" then "Enabled" else "Visible"):Connect(update)
			update()
		end
	end
end

-- --- light: a band that sweeps across a shape ---------------------------------------

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

-- A white copy of the shape (same rounded corners) over the layer's fill but under
-- anything drawn inside it; a UIGradient keeps it transparent except a band.
-- Returns the gradient and the offset span that starts and ends fully outside.
local function lightBand(obj: GuiObject, name: string, width: number, opacity: number, angle: number): (Frame, UIGradient, number)
	local light = Instance.new("Frame")
	light.Name = name
	light.BorderSizePixel = 0
	light.BackgroundColor3 = Color3.new(1, 1, 1)
	light.AnchorPoint = Vector2.new(0.5, 0.5)
	light.Position = UDim2.fromScale(0.5, 0.5)
	light.Size = UDim2.fromScale(1, 1)
	light.ZIndex = 0
	light.Visible = false
	light.Active = false
	local corner = obj:FindFirstChildWhichIsA("UICorner")
	if corner then
		corner:Clone().Parent = light
	end
	local g = Instance.new("UIGradient")
	g.Transparency = band(width, 1 - opacity)
	g.Rotation = angle
	g.Parent = light
	light.Parent = obj
	return light, g, 0.5 + width + math.abs(math.sin(math.rad(angle))) * 0.5
end

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
	local light, g, span = lightBand(obj, "FF_Shine", param(obj, "shiny", "width"), param(obj, "shiny", "opacity"), param(obj, "shiny", "angle"))

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

-- `_sheen`: one sweep each time the pointer enters the layer's button.
local function sheen(obj: GuiObject)
	local image = obj:IsA("ImageLabel") or obj:IsA("ImageButton")
	if obj:IsA("TextLabel") or (not image and obj.BackgroundTransparency >= 1) then
		warn("[FrameFig] _sheen needs a shape layer (rectangle, frame with a fill, or image): " .. obj:GetFullName())
		return
	end
	local time = math.max(0.05, param(obj, "sheen", "time"))
	local light, g, span = lightBand(obj, "FF_Sheen", param(obj, "sheen", "width"), param(obj, "sheen", "opacity"), param(obj, "sheen", "angle"))
	local value = Instance.new("NumberValue")
	value.Changed:Connect(function(u)
		g.Offset = Vector2.new(-span + u * span * 2, 0)
	end)
	local tween: Tween? = nil
	local source = hoverSource(obj)
	local wasHovering = false
	local st: Press
	st = listen(source, function()
		local hovering = st.hover and not locked(source)
		if hovering and not wasHovering then
			if tween then
				tween:Cancel()
			end
			value.Value = 0
			light.Visible = true
			local tw = TweenService:Create(value, TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut), { Value = 1 })
			tw.Completed:Connect(function(state)
				if state == Enum.PlaybackState.Completed then
					light.Visible = false
				end
			end)
			tw:Play()
			tween = tw
		end
		wasHovering = hovering
	end)
end

-- --- gleam: a white copy of the text, lit only inside a moving band -----------

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
				l.label.Text = label.Text
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

-- --- idle motion ----------------------------------------------------------------
-- Every layer gets its own random phase so rows of identical cards never move in step.

-- rays: square bursts turn forever; wide ones (a burst cut to a card) swing
-- instead, so their corners never sweep into view.
local function rays(obj: GuiObject, runtime: any): Tick
	local speed = param(obj, "rays", "speed")
	local amp = param(obj, "rays", "amp")
	local rate = param(obj, "rays", "rate")
	local parts = companions(obj)
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
		setRotation(parts, runtime, rot, "rays")
		setScale(parts, runtime, 1 + amp * (0.5 - 0.5 * math.cos(t * rate * TAU + ph)), "idle")
	end
end

local function spin(obj: GuiObject, runtime: any): Tick
	local speed = param(obj, "spin", "speed")
	local parts = companions(obj)
	local t = 0
	return function(dt)
		t += dt
		setRotation(parts, runtime, (t * speed) % 360, "spin")
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

local function float(obj: GuiObject, runtime: any): Tick
	local amp = param(obj, "float", "amp")
	local rate = param(obj, "float", "rate")
	local parts = companions(obj)
	-- amp is a share of the layer's own height, expressed in parent Scale units
	local lift = amp * obj.Size.Y.Scale
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		setOffset(parts, runtime, 0, -lift * math.sin(t * rate * TAU + ph), "float")
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

local function wiggle(obj: GuiObject, runtime: any): Tick
	local every = math.max(0.1, param(obj, "wiggle", "every"))
	local time = math.min(every, param(obj, "wiggle", "time"))
	local angle = param(obj, "wiggle", "angle")
	local parts = companions(obj)
	local t = math.random() * every
	local resting = true
	return function(dt)
		t = (t + dt) % every
		if t < time then
			local u = t / time
			setRotation(parts, runtime, angle * math.exp(-4 * u) * math.sin(u * TAU * 3), "wiggle")
			resting = false
		elseif not resting then
			setRotation(parts, runtime, 0, "wiggle")
			resting = true
		end
	end
end

local function sway(obj: GuiObject, runtime: any): Tick
	local angle = param(obj, "sway", "angle")
	local rate = param(obj, "sway", "rate")
	local parts = companions(obj)
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		setRotation(parts, runtime, angle * math.sin(t * rate * TAU + ph), "sway")
	end
end

-- Squash and stretch by resizing (UIScale is uniform, so it cannot squash).
local function wobble(obj: GuiObject): Tick?
	if obj:GetAttribute("FF_TextPx") then
		warn("[FrameFig] _wobble works on frames and images, not text: " .. obj:GetFullName())
		return nil
	end
	local amp = param(obj, "wobble", "amp")
	local rate = param(obj, "wobble", "rate")
	local parts = companions(obj)
	local bases = {}
	for i, o in parts do
		bases[i] = (o :: GuiObject).Size
	end
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		local w = math.sin(t * rate * TAU + ph)
		local sx, sy = 1 + amp * w, 1 - amp * w
		for i, o in parts do
			local b = bases[i]
			local g: any = o
			g.Size = UDim2.new(b.X.Scale * sx, b.X.Offset, b.Y.Scale * sy, b.Y.Offset)
		end
	end
end

local function jitter(obj: GuiObject, runtime: any): Tick
	local every = math.max(0.1, param(obj, "jitter", "every"))
	local time = math.min(every, param(obj, "jitter", "time"))
	local amount = param(obj, "jitter", "amount")
	local parts = companions(obj)
	local t = math.random() * every
	local resting = true
	return function(dt)
		t = (t + dt) % every
		if t < time then
			local px = amount * obj.AbsoluteSize.Y * (1 - t / time)
			local room = parentPixels(obj)
			if room.X > 0 and room.Y > 0 then
				local dx = (math.random() * 2 - 1) * px / room.X
				local dy = (math.random() * 2 - 1) * px / room.Y
				setOffset(parts, runtime, dx, dy, "jitter")
			end
			resting = false
		elseif not resting then
			setOffset(parts, runtime, 0, 0, "jitter")
			resting = true
		end
	end
end

-- `_halo`: a soft outline that breathes. Text uses its own outline (added if it has
-- none, tinted toward the halo colour if it has one); a frame or image gets an
-- outer stroke on a transparent copy of its box.
local function halo(obj: GuiObject, runtime: any, gui: Instance): Tick
	local tint = color(obj, "halo")
	local size = param(obj, "halo", "size")
	local rate = param(obj, "halo", "rate")
	local low = param(obj, "halo", "low")
	local high = param(obj, "halo", "high")
	local isText = obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox")
	local stroke: UIStroke
	local own = false
	if isText then
		local existing = obj:FindFirstChildWhichIsA("UIStroke")
		if existing then
			stroke = existing
			own = true
		else
			stroke = Instance.new("UIStroke")
			stroke.Name = "FF_Halo"
			stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
			stroke.LineJoinMode = Enum.LineJoinMode.Round
			stroke.Color = tint
			stroke.Parent = obj
		end
	else
		local host = Instance.new("Frame")
		host.Name = "FF_Halo"
		host.BackgroundTransparency = 1
		host.BorderSizePixel = 0
		host.AnchorPoint = Vector2.new(0.5, 0.5)
		host.Position = UDim2.fromScale(0.5, 0.5)
		host.Size = UDim2.fromScale(1, 1)
		host.ZIndex = 0
		host.Active = false
		local corner = obj:FindFirstChildWhichIsA("UICorner")
		if corner then
			corner:Clone().Parent = host
		end
		stroke = Instance.new("UIStroke")
		stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
		stroke.LineJoinMode = Enum.LineJoinMode.Round
		pcall(function()
			(stroke :: any).BorderStrokePosition = Enum.BorderStrokePosition.Outer
		end)
		stroke.Color = tint
		stroke.Parent = host
		host.Parent = obj
	end
	local baseColor = stroke.Color
	local basePx = stroke:GetAttribute("FF_StrokePx")
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		local w = 0.5 - 0.5 * math.cos(t * rate * TAU + ph)
		local k = runtime.scaleFactor(gui) or 1
		local s = obj:GetAttribute("FF_TextScale") or 1
		local base = if own and basePx then basePx * k / s else 0
		stroke.Thickness = base + size * k / s * (0.5 + 0.5 * w)
		if own then
			stroke.Color = baseColor:Lerp(tint, low + (high - low) * w)
		else
			stroke.Transparency = 1 - (low + (high - low) * w)
		end
	end
end

-- `_tide`: the layer's gradient fill slides back and forth (and turns).
local function tide(obj: GuiObject): Tick?
	local g = obj:FindFirstChildWhichIsA("UIGradient")
	if not g then
		warn("[FrameFig] _tide needs a gradient fill: " .. obj:GetFullName())
		return nil
	end
	local grad = g :: UIGradient
	local amp = param(obj, "tide", "amp")
	local rate = param(obj, "tide", "rate")
	local turn = param(obj, "tide", "turn")
	local baseOffset, baseRotation = grad.Offset, grad.Rotation
	local t, ph = 0, randomPhase()
	return function(dt)
		t += dt
		grad.Offset = baseOffset + Vector2.new(amp * math.sin(t * rate * TAU + ph), 0)
		if turn ~= 0 then
			grad.Rotation = (baseRotation + turn * t) % 360
		end
	end
end

-- --- pointer ------------------------------------------------------------------------
-- These react to the layer's button (the layer itself when it is not in one).

local function hovering(source: GuiObject): boolean
	local st = pressOf(source)
	return st.hover and not locked(source)
end

local function lift(obj: GuiObject, runtime: any): Tick
	local amount = param(obj, "lift", "amount")
	local time = param(obj, "lift", "time")
	local parts = companions(obj)
	local source = hoverSource(obj)
	pressOf(source)
	local cur = 0
	return function(dt)
		local target = if hovering(source) then -amount * obj.Size.Y.Scale else 0
		if math.abs(target - cur) < 1e-5 then
			return
		end
		cur += (target - cur) * ease(dt, time)
		setOffset(parts, runtime, 0, cur, "lift")
	end
end

local function tip(obj: GuiObject, runtime: any): Tick
	local angle = param(obj, "tip", "angle")
	local time = param(obj, "tip", "time")
	local parts = companions(obj)
	local source = hoverSource(obj)
	pressOf(source)
	local cur = 0
	return function(dt)
		local target = 0
		if hovering(source) and source.AbsoluteSize.X > 0 then
			target = math.clamp(pointerFrom(source).X / (source.AbsoluteSize.X / 2), -1, 1) * angle
		end
		if math.abs(target - cur) < 1e-3 then
			return
		end
		cur += (target - cur) * ease(dt, time)
		setRotation(parts, runtime, cur, "tip")
	end
end

local function pull(obj: GuiObject, runtime: any): Tick
	local strength = param(obj, "pull", "strength")
	local time = param(obj, "pull", "time")
	local parts = companions(obj)
	local source = hoverSource(obj)
	pressOf(source)
	local cur = Vector2.zero
	return function(dt)
		local target = Vector2.zero
		if hovering(source) then
			local room = parentPixels(obj)
			if room.X > 0 and room.Y > 0 then
				local d = pointerFrom(source) * strength
				target = Vector2.new(d.X / room.X, d.Y / room.Y)
			end
		end
		if (target - cur).Magnitude < 1e-5 then
			return
		end
		cur += (target - cur) * ease(dt, time)
		setOffset(parts, runtime, cur.X, cur.Y, "pull")
	end
end

-- `_splash`: a circle spreads from the press point, clipped to the layer's box.
local function splash(obj: GuiObject)
	local tint = color(obj, "splash")
	local opacity = param(obj, "splash", "opacity")
	local time = math.max(0.05, param(obj, "splash", "time"))
	local holder = Instance.new("Frame")
	holder.Name = "FF_Splash"
	holder.BackgroundTransparency = 1
	holder.BorderSizePixel = 0
	holder.AnchorPoint = Vector2.new(0.5, 0.5)
	holder.Position = UDim2.fromScale(0.5, 0.5)
	holder.Size = UDim2.fromScale(1, 1)
	holder.ClipsDescendants = true
	holder.ZIndex = 10000
	holder.Active = false
	holder.Parent = obj
	local source = hoverSource(obj)
	local st: Press
	local wasHeld = false
	st = listen(source, function()
		local held = st.held and not locked(source)
		if held and not wasHeld and holder.AbsoluteSize.X > 0 then
			local at = pointerFrom(holder) + holder.AbsoluteSize / 2
			local dot = Instance.new("Frame")
			dot.Name = "Dot"
			dot.BorderSizePixel = 0
			dot.BackgroundColor3 = tint
			dot.BackgroundTransparency = 1 - opacity
			dot.AnchorPoint = Vector2.new(0.5, 0.5)
			dot.SizeConstraint = Enum.SizeConstraint.RelativeXX
			dot.Position = UDim2.fromScale(at.X / holder.AbsoluteSize.X, at.Y / holder.AbsoluteSize.Y)
			dot.Size = UDim2.fromScale(0, 0)
			local round = Instance.new("UICorner")
			round.CornerRadius = UDim.new(0.5, 0)
			round.Parent = dot
			dot.Parent = holder
			local reach = 2.4 * math.max(holder.AbsoluteSize.X, holder.AbsoluteSize.Y) / holder.AbsoluteSize.X
			local tw = TweenService:Create(dot, TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
				Size = UDim2.fromScale(reach, reach),
				BackgroundTransparency = 1,
			})
			tw.Completed:Connect(function()
				dot:Destroy()
			end)
			tw:Play()
		end
		wasHeld = held
	end)
end

-- --- entrances --------------------------------------------------------------------
-- They watch visibility even while hidden, so they replay on every show.

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

-- Calls `play` on every hidden -> shown change (and once if shown at start).
local function onShow(obj: GuiObject, play: () -> ()): Tick
	local was = false
	return function()
		local now = shown(obj)
		if now and not was then
			play()
		end
		was = now
	end
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
	return onShow(obj, function()
		value.Value = from
		TweenService:Create(value, TweenInfo.new(time, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Value = 1 }):Play()
	end)
end

local FADE_PROPS = {
	{ "GuiObject", "BackgroundTransparency" },
	{ "ImageLabel", "ImageTransparency" },
	{ "ImageButton", "ImageTransparency" },
	{ "TextLabel", "TextTransparency" },
	{ "TextButton", "TextTransparency" },
	{ "TextBox", "TextTransparency" },
	{ "UIStroke", "Transparency" },
}

local function fade(obj: GuiObject): Tick
	local time = math.max(0.01, param(obj, "fade", "time"))
	-- Read on the first show, after every other effect has built its parts.
	local props: { { o: any, p: string, base: number } }? = nil
	local function collect()
		local list = {}
		if obj:IsA("CanvasGroup") then
			table.insert(list, { o = obj, p = "GroupTransparency", base = obj.GroupTransparency })
			return list
		end
		local all = obj:GetDescendants()
		table.insert(all, 1, obj)
		for _, o in all do
			if o.Name:sub(1, 3) ~= "FF_" then
				for _, pair in FADE_PROPS do
					if o:IsA(pair[1]) then
						local v = (o :: any)[pair[2]]
						if v < 1 then
							table.insert(list, { o = o, p = pair[2], base = v })
						end
					end
				end
			end
		end
		return list
	end
	local value = Instance.new("NumberValue")
	value.Value = 1
	value.Changed:Connect(function(v)
		for _, e in props or {} do
			e.o[e.p] = 1 - (1 - e.base) * v
		end
	end)
	return onShow(obj, function()
		if not props then
			props = collect()
		end
		value.Value = 0
		TweenService:Create(value, TweenInfo.new(time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = 1 }):Play()
	end)
end

local function slide(obj: GuiObject, runtime: any): Tick
	local distance = param(obj, "slide", "distance")
	local angle = math.rad(param(obj, "slide", "angle"))
	local time = math.max(0.01, param(obj, "slide", "time"))
	local dx, dy = math.sin(angle) * distance, -math.cos(angle) * distance
	local parts = companions(obj)
	local value = Instance.new("NumberValue")
	value.Value = 0
	value.Changed:Connect(function(v)
		setOffset(parts, runtime, dx * v, dy * v, "slide")
	end)
	return onShow(obj, function()
		value.Value = 1
		TweenService:Create(value, TweenInfo.new(time, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), { Value = 0 }):Play()
	end)
end

-- `_stagger`: the children pop in one after another, in reading order. A child's
-- drop shadow and baked background pop with it. A single clip wrapper is looked into.
local function stagger(obj: GuiObject, runtime: any): Tick
	local gap = param(obj, "stagger", "gap")
	local from = param(obj, "stagger", "from")
	local time = math.max(0.01, param(obj, "stagger", "time"))
	local function visibleKids(holder: Instance): { GuiObject }
		local list = {}
		for _, c in holder:GetChildren() do
			if c:IsA("GuiObject") and c.Name:sub(1, 3) ~= "FF_" then
				table.insert(list, c)
			end
		end
		return list
	end
	local groups: { { parts: { Instance }, value: NumberValue } }? = nil
	local function build()
		local kids = visibleKids(obj)
		if #kids == 1 then
			local id = kids[1]:GetAttribute("FF_Id")
			if type(id) == "string" and id:sub(-5) == ":clip" then
				kids = visibleKids(kids[1])
			end
		end
		local byId: { [string]: { Instance } } = {}
		local order: { { Instance } } = {}
		for _, c in kids do
			local id = c:GetAttribute("FF_Id")
			local key = if type(id) == "string" then (id:gsub(":shadow$", ""):gsub(":bg$", "")) else nil
			if key and byId[key] then
				table.insert(byId[key], c)
			else
				local g = { c }
				if key then
					byId[key] = g
				end
				table.insert(order, g)
			end
		end
		table.sort(order, function(a, b)
			local pa, pb = (a[1] :: GuiObject).AbsolutePosition, (b[1] :: GuiObject).AbsolutePosition
			if math.abs(pa.Y - pb.Y) > 2 then
				return pa.Y < pb.Y
			end
			return pa.X < pb.X
		end)
		local list = {}
		for _, g in order do
			local value = Instance.new("NumberValue")
			value.Value = 1
			value.Changed:Connect(function(v)
				setScale(g, runtime, v, "stagger")
			end)
			table.insert(list, { parts = g, value = value })
		end
		return list
	end
	local generation = 0
	return onShow(obj, function()
		if not groups then
			groups = build()
		end
		generation += 1
		local gen = generation
		for i, g in groups :: any do
			g.value.Value = from
			task.delay((i - 1) * gap, function()
				if gen == generation then
					TweenService:Create(g.value, TweenInfo.new(time, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Value = 1 }):Play()
				end
			end)
		end
	end)
end

-- --- start ---------------------------------------------------------------------

type Maker = (GuiObject, any, Instance) -> Tick?

-- Run every frame while the page shows.
local IDLE: { [string]: Maker } = {
	rays = rays,
	spin = spin,
	pulse = pulse,
	float = float,
	blink = blink,
	wiggle = wiggle,
	sway = sway,
	wobble = wobble,
	jitter = jitter,
	halo = halo,
	tide = tide,
	lift = lift,
	tip = tip,
	pull = pull,
}

-- Run every frame, hidden or not, to see the page appear.
local ENTRANCE: { [string]: Maker } = {
	pop = pop,
	fade = fade,
	slide = slide,
	stagger = stagger,
}

function Effects.start(gui: Instance, runtime: any)
	if not RunService:IsRunning() then
		return
	end
	local ticks: { Tick } = {}
	local watchers: { Tick } = {}
	local function try(obj: Instance, name: string, fn: () -> Tick?, into: { Tick }?)
		local ok, result = pcall(fn)
		if not ok then
			warn(("[FrameFig] _%s on %s: %s"):format(name, obj:GetFullName(), tostring(result)))
		elseif result then
			table.insert(into or ticks, result)
		end
	end
	-- `gui` itself counts when it is a GuiObject (Runtime.attach on a cloned button).
	local objects = runtime.ownDescendants(gui)
	if gui:IsA("GuiObject") then
		table.insert(objects, 1, gui)
	end
	for _, obj in objects do
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
			local a = btn:GetAttributes()
			if a.FF_goto or a.FF_show or a.FF_hide or a.FF_switch then
				try(btn, "goto", function()
					navigation(btn)
					return nil
				end)
			end
		end
		if obj:IsA("GuiObject") then
			local g = obj :: GuiObject
			if g:GetAttribute("FF_when") then
				try(g, "when", function()
					whenState(g)
					return nil
				end)
			end
			if g:GetAttribute("FF_shiny") then
				try(g, "shiny", function()
					return shiny(g)
				end)
			end
			if g:GetAttribute("FF_sheen") then
				try(g, "sheen", function()
					sheen(g)
					return nil
				end)
			end
			if g:GetAttribute("FF_splash") then
				try(g, "splash", function()
					splash(g)
					return nil
				end)
			end
			if g:GetAttribute("FF_gleam") then
				try(g, "gleam", function()
					return gleam(g :: any, gui, runtime)
				end)
			end
			if g:GetAttribute("FF_drift") then
				try(g, "drift", function()
					return drift(g :: any, gui, runtime)
				end)
			end
			for tag, fn in IDLE do
				if g:GetAttribute("FF_" .. tag) then
					try(g, tag, function()
						return fn(g, runtime, gui)
					end)
				end
			end
			for tag, fn in ENTRANCE do
				if g:GetAttribute("FF_" .. tag) then
					try(g, tag, function()
						return fn(g, runtime, gui)
					end, watchers)
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
