-- Inserted into every FrameFig ScreenGui next to the FrameFigRuntime module.
-- Starts the ScreenGui itself when it is an import, and every page Folder inside it
-- (a ScreenGui with several pages keeps one import per Folder).
-- The plugin carries a template copy of this script; only run inside a built ScreenGui.
local gui = script.Parent
if not gui:IsA("ScreenGui") then
	return
end
local Runtime = require(gui:WaitForChild("FrameFigRuntime"))
if gui:GetAttribute("FF_Root") then
	Runtime.watch(gui)
end
for _, child in gui:GetChildren() do
	if child:IsA("Folder") and child:GetAttribute("FF_Root") then
		Runtime.watch(child)
	end
end
