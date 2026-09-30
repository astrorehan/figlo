-- FrameFig Studio plugin: paste the code from the Figma plugin, press Import.

if not plugin then
	return
end

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local StarterGui = game:GetService("StarterGui")

local root = script.Parent
local Importer = require(root.Importer)

local CACHE_KEY = "FrameFig_UploadCache"

local toolbar = plugin:CreateToolbar("FrameFig")
local button = toolbar:CreateButton("FrameFig", "Import a Figma frame by code", "")
button.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui(
	"FrameFig",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 300, 230, 260, 210)
)
widget.Title = "FrameFig"

local frame = Instance.new("Frame")
frame.Size = UDim2.fromScale(1, 1)
frame.BackgroundColor3 = Color3.fromRGB(46, 46, 46)
frame.BorderSizePixel = 0
frame.Parent = widget

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = frame
local pad = Instance.new("UIPadding")
for _, side in { "PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight" } do
	(pad :: any)[side] = UDim.new(0, 10)
end
pad.Parent = frame

local codeBox = Instance.new("TextBox")
codeBox.LayoutOrder = 1
codeBox.Size = UDim2.new(1, 0, 0, 36)
codeBox.PlaceholderText = "Code from Figma (e.g. K7P2QX)"
codeBox.Text = ""
codeBox.ClearTextOnFocus = false
codeBox.Font = Enum.Font.GothamBold
codeBox.TextSize = 18
codeBox.TextColor3 = Color3.new(1, 1, 1)
codeBox.PlaceholderColor3 = Color3.fromRGB(140, 140, 140)
codeBox.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
codeBox.Parent = frame
Instance.new("UICorner").Parent = codeBox

local importButton = Instance.new("TextButton")
importButton.LayoutOrder = 2
importButton.Size = UDim2.new(1, 0, 0, 32)
importButton.Text = "Import"
importButton.Font = Enum.Font.GothamBold
importButton.TextSize = 16
importButton.TextColor3 = Color3.new(1, 1, 1)
importButton.BackgroundColor3 = Color3.fromRGB(0, 132, 255)
importButton.Parent = frame
Instance.new("UICorner").Parent = importButton

local pageButton = Instance.new("TextButton")
pageButton.LayoutOrder = 3
pageButton.Size = UDim2.new(1, 0, 0, 28)
pageButton.Text = "Import as page of selected ScreenGui"
pageButton.Font = Enum.Font.GothamMedium
pageButton.TextSize = 13
pageButton.TextColor3 = Color3.new(1, 1, 1)
pageButton.BackgroundColor3 = Color3.fromRGB(70, 70, 70)
pageButton.Parent = frame
Instance.new("UICorner").Parent = pageButton

local status = Instance.new("TextLabel")
status.LayoutOrder = 4
status.Size = UDim2.new(1, 0, 0, 70)
status.BackgroundTransparency = 1
status.Text = "Start the relay, export in Figma, paste the code."
status.TextWrapped = true
status.TextXAlignment = Enum.TextXAlignment.Left
status.TextYAlignment = Enum.TextYAlignment.Top
status.Font = Enum.Font.Gotham
status.TextSize = 13
status.TextColor3 = Color3.fromRGB(200, 200, 200)
status.Parent = frame

button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

local busy = false
local function runImport(asPage: boolean)
	if busy or codeBox.Text:gsub("%s", "") == "" then
		return
	end
	local into = nil
	if asPage then
		local sel = Selection:Get()[1]
		if not (sel and sel:IsA("ScreenGui") and sel:FindFirstChild("FrameFigRuntime")) then
			status.Text = "Select a ScreenGui made by FrameFig first."
			return
		end
		into = sel
	end
	busy = true
	importButton.Text = "Importing…"
	local cache = plugin:GetSetting(CACHE_KEY) or {}
	local recording = ChangeHistoryService:TryBeginRecording("FrameFig import")
	local ok, gui, warnings = pcall(Importer.run, codeBox.Text, {
		parent = StarterGui,
		into = into,
		runtime = root.Runtime,
		client = root.Client,
		cache = cache,
		log = function(msg)
			status.Text = msg
		end,
	})
	plugin:SetSetting(CACHE_KEY, cache)
	if recording then
		ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end
	if ok then
		Selection:Set({ gui })
		status.Text = ("Imported %s."):format(gui:GetFullName())
		if #warnings > 0 then
			status.Text ..= (" %d warnings (see Output)."):format(#warnings)
			for _, w in warnings do
				warn("[FrameFig] " .. w)
			end
		end
	else
		status.Text = "Failed: " .. tostring(gui)
		warn("[FrameFig] " .. tostring(gui))
	end
	importButton.Text = "Import"
	busy = false
end

importButton.Activated:Connect(function()
	runImport(false)
end)
pageButton.Activated:Connect(function()
	runImport(true)
end)
codeBox.FocusLost:Connect(function(enter)
	if enter then
		runImport(false)
	end
end)
