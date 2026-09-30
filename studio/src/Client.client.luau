-- Inserted into every FrameFig ScreenGui next to the FrameFigRuntime module.
-- The plugin carries a template copy of this script; only run inside a built ScreenGui.
if not script.Parent:IsA("ScreenGui") then
	return
end
require(script.Parent:WaitForChild("FrameFigRuntime")).watch(script.Parent)
