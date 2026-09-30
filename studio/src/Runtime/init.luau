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

local function textObjects(gui: Instance): { GuiObject }
	local list = {}
	for _, d in gui:GetDescendants() do
		if d:GetAttribute("FF_TextPx") and (d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox")) then
			table.insert(list, d :: GuiObject)
		end
	end
	return list
end

local function fit(label: any, k: number)
	local want = label:GetAttribute("FF_TextPx") * k
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
	root:GetPropertyChangedSignal("AbsoluteSize"):Connect(refresh)
	refresh()
	Effects.start(gui, Runtime)
end

return Runtime
