--!strict
-- FrameFig runtime: keeps text and text strokes proportional to the design,
-- and starts the tag effects (Effects module) when the GUI runs in game.
--
-- Roblox TextSize is an integer number of pixels (max 100), so each label stores
-- its design size in FF_TextPx and gets a UIScale that supplies the fractional
-- part. Everything else is already Scale-based and needs no script.

local Effects = require(script.Effects)

local Runtime = {}

local MAX_TEXT_SIZE = 100

local function scaleOf(obj: Instance): UIScale
	local scale = obj:FindFirstChild("FF_Scale") :: UIScale?
	if not scale then
		local created = Instance.new("UIScale")
		created.Name = "FF_Scale"
		created.Parent = obj
		scale = created
	end
	return scale :: UIScale
end

-- One UIScale per object: the text fraction (FF_TextScale) times every effect
-- channel (button press, idle pulse, entrance pop...), kept per object in memory.
local channels: { [Instance]: { [string]: number } } = setmetatable({}, { __mode = "k" }) :: any

local function applyScale(obj: Instance)
	local k = obj:GetAttribute("FF_TextScale") or 1
	for _, v in channels[obj] or {} do
		k *= v
	end
	scaleOf(obj).Scale = k
end

function Runtime.setFxScale(obj: Instance, k: number, channel: string?)
	local list = channels[obj]
	if not list then
		list = {}
		channels[obj] = list
	end
	list[channel or "button"] = k
	applyScale(obj)
end

-- Position and rotation work the same way: each effect owns a channel (float,
-- lift, slide...) and the object sits at its Figma place plus the sum of them.
-- Offsets are in the parent's Scale units. The place is read on first use, so move
-- a wrapper (not the object) if your code also moves it.
local offsets: { [Instance]: { base: UDim2, ch: { [string]: Vector2 } } } = setmetatable({}, { __mode = "k" }) :: any
local turns: { [Instance]: { base: number, ch: { [string]: number } } } = setmetatable({}, { __mode = "k" }) :: any

function Runtime.setFxOffset(obj: Instance, x: number, y: number, channel: string)
	local g = obj :: GuiObject
	local e = offsets[obj]
	if not e then
		e = { base = g.Position, ch = {} }
		offsets[obj] = e
	end
	e.ch[channel] = Vector2.new(x, y)
	local sx, sy = 0, 0
	for _, v in e.ch do
		sx += v.X
		sy += v.Y
	end
	local b = e.base
	g.Position = UDim2.new(b.X.Scale + sx, b.X.Offset, b.Y.Scale + sy, b.Y.Offset)
end

function Runtime.setFxRotation(obj: Instance, degrees: number, channel: string)
	local g = obj :: GuiObject
	local e = turns[obj]
	if not e then
		e = { base = g.Rotation, ch = {} }
		turns[obj] = e
	end
	e.ch[channel] = degrees
	local sum = e.base
	for _, v in e.ch do
		sum += v
	end
	g.Rotation = sum
end

-- Descendants of a container, minus page Folders nested in it (each page is
-- watched on its own, so it must not be started twice).
function Runtime.ownDescendants(container: Instance): { Instance }
	local list = {}
	local function walk(obj: Instance)
		for _, c in obj:GetChildren() do
			if c:IsA("Folder") and c:GetAttribute("FF_Root") and c ~= container then
				continue
			end
			table.insert(list, c)
			walk(c)
		end
	end
	walk(container)
	return list
end

local function textObjects(gui: Instance): { GuiObject }
	local list = {}
	for _, d in Runtime.ownDescendants(gui) do
		if d:GetAttribute("FF_TextPx") and (d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox")) then
			table.insert(list, d :: GuiObject)
		end
	end
	return list
end

-- `_txt` labels shrink to stay inside their box when code gives them longer text.
local shrink: { [Instance]: number } = setmetatable({}, { __mode = "k" }) :: any

local function fit(label: any, k: number)
	local want = label:GetAttribute("FF_TextPx") * k * (shrink[label] or 1)
	if want <= 0 then
		return
	end
	local size = math.clamp(math.floor(want), 1, MAX_TEXT_SIZE)
	local s = want / size

	label:SetAttribute("FF_TextScale", s)
	applyScale(label)
	label.TextSize = size

	-- UIScale also scales the box, so shrink the box to keep its on-screen size.
	local base: UDim2? = label:GetAttribute("FF_BaseSize")
	if base then
		label.Size = UDim2.fromScale(base.X.Scale / s, base.Y.Scale / s)
	end
	for _, child in label:GetChildren() do
		if child:IsA("UIStroke") then
			local px = child:GetAttribute("FF_StrokePx")
			if px then
				child.Thickness = px * k / s
			end
		end
	end
end

function Runtime.scaleFactor(gui: Instance): number?
	local rootName = gui:GetAttribute("FF_Root")
	local designH = gui:GetAttribute("FF_DesignH")
	local root = rootName and gui:FindFirstChild(rootName)
	if not root or not designH or not root:IsA("GuiObject") or root.AbsoluteSize.Y <= 0 then
		return nil
	end
	return root.AbsoluteSize.Y / designH
end

function Runtime.apply(gui: Instance)
	local k = Runtime.scaleFactor(gui)
	if not k then
		return
	end
	for _, label in textObjects(gui) do
		fit(label, k)
	end
end

-- TextBounds and AbsoluteSize are both screen pixels (UIScale included). Width
-- grows linearly with the size, so one step gets a single line close; wrapped text
-- steps down until it fits. New text starts again from full size.
local function keepInside(label: any, gui: Instance): () -> ()
	local function refit()
		local k = Runtime.scaleFactor(gui)
		if k then
			fit(label, k)
		end
	end
	local function check()
		for _ = 1, 8 do
			local box, bounds = label.AbsoluteSize, label.TextBounds
			if box.X <= 0 or bounds.X <= 0 then
				return
			end
			local f = shrink[label] or 1
			local want = f
			if label.TextWrapped then
				if bounds.Y > box.Y + 0.5 and f > 0.3 then
					want = f * 0.9
				end
			elseif bounds.X > box.X * 1.06 then -- the design itself may overhang its box a little
				want = math.max(0.3, f * box.X * 0.98 / bounds.X)
			end
			if want >= f - 0.005 then
				return
			end
			shrink[label] = want
			refit()
		end
	end
	label:GetPropertyChangedSignal("Text"):Connect(function()
		shrink[label] = nil
		refit()
		check()
	end)
	label:GetPropertyChangedSignal("TextBounds"):Connect(check)
	task.defer(check)
	return check
end

function Runtime.watch(gui: Instance)
	local root = gui:FindFirstChild(gui:GetAttribute("FF_Root") or "")
	if not root or not root:IsA("GuiObject") then
		return
	end
	local labels = textObjects(gui)
	local function refresh()
		local k = Runtime.scaleFactor(gui)
		if k then
			for _, label in labels do
				fit(label, k)
			end
		end
	end
	local checks = {}
	for _, label in labels do
		if label:GetAttribute("FF_txt") then
			table.insert(checks, keepInside(label, gui))
		end
	end
	root:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
		for _, label in labels do
			shrink[label] = nil
		end
		refresh()
		for _, check in checks do
			check()
		end
	end)
	refresh()
	Effects.start(gui, Runtime)
end

-- Starts the effects of an object that lives outside its FrameFig ScreenGui (a
-- template your code cloned), the object itself included. Text keeps the size it
-- had when cloned; call Runtime.apply on a container for proportional text.
function Runtime.attach(obj: Instance)
	Effects.start(obj, Runtime)
end

return Runtime
