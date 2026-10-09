-- Loads the actual shipping modules with Lune's Roblox instances and injectable services.
-- It tests object construction and import behavior, not Studio rendering or asset permissions.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local task = require("@lune/task")
local TestEnv = {}
function TestEnv.new(extraServices, extraGlobals)
	local services = {
		TextService = { GetTextBoundsAsync = function(_, params) return roblox.Vector2.new(#params.Text * params.Size * 0.5, params.Size) end },
		HttpService = {
			JSONEncode = function(_, value) return serde.encode("json", value) end,
			JSONDecode = function(_, value) return serde.decode("json", value) end,
		},
		ServerStorage = roblox.Instance.new("ServerStorage"),
		StudioService = { GetUserId = function() return 123 end },
		ContentProvider = {}, AssetService = {},
	}
	for name, service in extraServices or {} do services[name] = service end
	local modules = {}
	local function load(name)
		if modules[name] then return modules[name] end
		local path = "studio/src/" .. name .. ".luau"
		local env = {
			script = { Parent = setmetatable({}, { __index = function(_, key) return key end }), Effects = "Runtime/Effects" },
			require = load,
			game = { GetService = function(_, service) assert(services[service], "Unexpected service: " .. service); return services[service] end },
			task = task, warn = print,
		}
		for key, value in roblox do env[key] = value end
		for key, value in extraGlobals or {} do env[key] = value end
		modules[name] = luau.load(fs.readFile(path), { debugName = path, environment = env })()
		return modules[name]
	end
	return { load = load, services = services, roblox = roblox }
end
return TestEnv
