-- Verify the actual distributable model, not only its source directory.
local fs = require("@lune/fs")
local roblox = require("@lune/roblox")
local models = roblox.deserializeModel(fs.readFile("build/Figlo.rbxm"))
assert(#models == 1 and models[1].Name == "Figlo", "Plugin must have one Figlo root")
local root = models[1]
local expected = {
	Builder = "Builder.luau", Crisp = "Crisp.luau", FontMetrics = "FontMetrics.luau",
	ImageKey = "ImageKey.luau", Protocol = "Protocol.luau", ImportAction = "ImportAction.luau",
	Importer = "Importer.luau", Client = "Client.client.luau", Plugin = "Plugin.server.luau",
	Runtime = "Runtime/init.luau",
}
local function sameSource(instance, path)
	assert(instance and instance:IsA("LuaSourceContainer"), "Missing script: " .. path)
	assert(instance.Source:gsub("\r\n", "\n") == fs.readFile("studio/src/" .. path):gsub("\r\n", "\n"), "Packaged source mismatch: " .. path)
end
for name, path in expected do sameSource(root:FindFirstChild(name), path) end
sameSource(root:FindFirstChild("Runtime"):FindFirstChild("Effects"), "Runtime/Effects.luau")
assert(root:FindFirstChild("Plugin"):IsA("Script") and root:FindFirstChild("Client"):IsA("LocalScript"), "Plugin/client script classes")
local retired = string.lower("Frame" .. "wisp")
for _, instance in root:GetDescendants() do
	assert(not instance.Name:lower():find(retired, 1, true), "Retired name in model")
	if instance:IsA("LuaSourceContainer") then assert(not instance.Source:lower():find(retired, 1, true), "Retired name in packaged source") end
end
root:Destroy()
print("package: compiled plugin contains all shipping modules with exact source and clean branding")
