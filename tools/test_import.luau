local fs = require("@lune/fs")
local serde = require("@lune/serde")
local TestEnv = require("./TestEnv")
local env = TestEnv.new(nil, { task = { wait = function() end } })
local r = env.roblox
local sample = serde.decode("json", fs.readFile("samples/demo.ir.json"))
local function check(condition, message) assert(condition, message) end
local function copy(value) return serde.decode("json", serde.encode("json", value)) end
local Builder = env.load("Builder")
local gui, warnings = Builder.build(copy(sample), { images = {}, imageSizes = {}, parent = nil })
check(gui.Name == "Figlo_Figlo Demo" and #warnings == 0, "demo builds without assets or warnings")
local root = gui:FindFirstChild("Figlo Demo")
check(root:FindFirstChild("Title"):IsA("TextLabel"), "text stays editable")
check(root:FindFirstChild("Continue"):IsA("TextButton"), "smooth tag creates a button")
check(root:FindFirstChild("Card"):FindFirstChild("Dot"):GetAttribute("FF_pulse") == true, "nested effects survive")
check(root:FindFirstChild("Card").Position == r.UDim2.fromScale(0.5, 0.5), "nested geometry")
check(math.abs(root:FindFirstChildWhichIsA("UIAspectRatioConstraint").AspectRatio - 1.6) < 1e-6, "root aspect")
gui:Destroy()

local images, uploaded, destroyed = {}, 0, 0
local payload = { ir = copy(sample), images = {} }
local Http = env.services.HttpService
function Http:GetAsync(url, _, headers)
	check(headers.Authorization == "Bearer " .. string.rep("t", 32), "every relay request carries pairing token")
	if url:find("/pull/", 1, true) then return self:JSONEncode(payload) end
	return images[url:match("/(%d+)$")]
end
local assets = env.services.AssetService
local failWrite, failUpload, attempts, retryOnce = false, false, 0, false
function assets:CreateEditableImage(options)
	return { Size = options.Size,
		WritePixelsBuffer = function() if failWrite then error("pixel write failed") end end,
		Destroy = function() destroyed += 1 end,
	}
end
function assets:CreateAssetAsync()
	attempts += 1
	if failUpload then return r.Enum.CreateAssetResult.Failure, 0 end
	if retryOnce then retryOnce = false; return r.Enum.CreateAssetResult.Failure, 0 end
	uploaded += 1
	return r.Enum.CreateAssetResult.Success, uploaded
end
-- Retry without sleeping in this test; the shipping retry policy is still exercised.
local Importer = env.load("Importer")
local parent = r.Instance.new("Folder")
local opts = { parent = parent, token = string.rep("t", 32), checkImages = false, crisp = false, cache = {} }
local first = Importer.run("ABCDEF", opts)
first.Name = "RenamedPanel"
first.DisplayOrder = 42
local firstRoot = first:FindFirstChild("Figlo Demo")
firstRoot.Size = r.UDim2.fromScale(0.4, 0.4)
firstRoot:FindFirstChild("Continue"):SetAttribute("FF_smooth_hover", 1.22)
for index = 1, 3 do
	payload.ir = copy(sample)
	payload.ir.root.children[3].fx.smooth.hover = 1.12 + index * 0.01
	local again = Importer.run("ABCDEF", opts)
	check(again == first and again.Name == "RenamedPanel" and again.DisplayOrder == 42, "re-import preserves container")
	local current = again:FindFirstChild("Figlo Demo")
	check(current.Size == r.UDim2.fromScale(0.4, 0.4), "repeated re-import preserves root placement")
	check(math.abs(current:FindFirstChild("Continue"):GetAttribute("FF_smooth_hover") - 1.22) < 1e-6, "repeated re-import preserves effect override")
	local snap = Http:JSONDecode(again:GetAttribute("FF_Imported"))
	check(snap["demo:button|Continue"].FF_smooth_hover ~= 1.22, "snapshot retains Figma values")
end
check(#env.services.ServerStorage:FindFirstChild("FigloBackups"):GetChildren() == 1, "one backup per source")
local extra = r.Instance.new("Frame"); extra.Name = "Handmade"; extra.Parent = first
local page = copy(sample); page.source.node = "demo:second"; page.root.id = "demo:second"; page.root.name = "Second"
payload.ir = page; opts.into = first
local second = Importer.run("ABCDEF", opts)
check(second:IsA("Folder") and second.Parent == first and not second:FindFirstChild("Second").Visible, "additional page starts hidden")
check(first:FindFirstChild("Handmade") == extra, "objects outside replaced root survive")
check(Importer.run("ABCDEF", opts) == second, "page updates in place")
opts.into = nil

-- Existing game's references must survive the product rename.
local runtimeTemplate = r.Instance.new("ModuleScript"); runtimeTemplate.Source = fs.readFile("studio/src/Runtime/init.luau")
local clientTemplate = r.Instance.new("LocalScript"); clientTemplate.Source = fs.readFile("studio/src/Client.client.luau")
local legacyRuntime = runtimeTemplate:Clone(); legacyRuntime.Name = "FrameFigRuntime"; legacyRuntime.Parent = first
local legacyClient = clientTemplate:Clone(); legacyClient.Name = "FrameFigClient"; legacyClient:SetAttribute("FF_Stock", true); legacyClient.Parent = first
opts.runtime, opts.client = runtimeTemplate, clientTemplate
payload.ir = copy(sample)
Importer.run("ABCDEF", opts)
check(first:FindFirstChild("FrameFigRuntime") and first:FindFirstChild("FrameFigClient") and not first:FindFirstChild("FigloRuntime"), "legacy module names survive re-import")
local custom = first:FindFirstChild("FrameFigClient"); custom:SetAttribute("FF_Stock", nil); custom.Source = "-- Custom game client"
Importer.run("ABCDEF", opts)
check(first:FindFirstChild("FrameFigClient") == custom and custom.Source == "-- Custom game client", "custom game client remains intact")
opts.runtime, opts.client = nil, nil
runtimeTemplate:Destroy(); clientTemplate:Destroy()

local ImageKey = env.load("ImageKey")
local Protocol = env.load("Protocol")
for _, relay in { "http://127.0.0.1:34880", "http://localhost:34880", "http://[::1]:34880" } do Protocol.validateRelay(relay) end
for _, relay in { "http://evil.example:34880", "http://127.0.0.1.evil:34880", "http://127.0.0.1:34880/path", "http://localhost:99999" } do
	check(not pcall(Protocol.validateRelay, relay), "non-loopback or invalid relay rejected")
end
check(ImageKey.make("sha", 1, 2, 1, 2, "user:1") ~= ImageKey.make("sha", 2, 1, 2, 1, "user:1"), "source dimensions partition cache")
check(ImageKey.make("sha", 2, 2, 1, 1, "user:1") ~= ImageKey.make("sha", 2, 2, 2, 2, "user:1"), "target dimensions partition cache")
check(ImageKey.make("sha", 1, 1, 1, 1, "user:1") ~= ImageKey.make("sha", 1, 1, 1, 1, "user:2"), "owners partition cache")

local imageIR = copy(sample)
imageIR.source.node = "demo:image"; imageIR.root.name = "ImagePanel"
imageIR.root.children = { { id = "demo:pixel", name = "Pixel", kind = "image", image = "pixel", x = 0.5, y = 0.5, w = 1, h = 1, pw = 1, ph = 1, rot = 0 } }
payload = { ir = imageIR, images = { { key = "pixel", sha = string.rep("a", 40), i = 0, w = 1, h = 1 } } }
images["0"] = string.char(255, 0, 127, 128)
Importer.run("ABCDEF", opts); Importer.run("ABCDEF", opts)
check(uploaded == 1 and destroyed == 1, "repeated imports reuse upload and dispose editable image")
opts.cache = {}; failWrite = true
check(not pcall(Importer.run, "ABCDEF", opts), "pixel write failure surfaces")
check(destroyed == 2, "failed pixel writes dispose editable image")
failWrite = false
failUpload = true
local priorAttempts = attempts
check(not pcall(Importer.run, "ABCDEF", opts) and attempts - priorAttempts == 4, "upload failure retries four times")
check(destroyed == 3, "failed uploads dispose editable image")
failUpload = false; retryOnce = true; priorAttempts = attempts
Importer.run("ABCDEF", opts)
check(attempts - priorAttempts == 2 and destroyed == 4, "transient upload failure recovers and disposes image")
payload.ir.v = 2
local before = #parent:GetChildren()
check(not pcall(Importer.run, "ABCDEF", opts) and #parent:GetChildren() == before, "invalid version changes nothing")

local ImportAction = env.load("ImportAction")
local operation, called = nil, false
local history = { TryBeginRecording = function() return "record" end,
	FinishRecording = function(_, id, op) check(id == "record", "record identity"); operation = op end }
local result = ImportAction.run(history, function() return "gui", {} end)
check(result == "gui" and operation == r.Enum.FinishRecordingOperation.Commit, "success commits Undo")
check(not pcall(ImportAction.run, history, function() error("injected failure") end), "failure surfaces")
check(operation == r.Enum.FinishRecordingOperation.Cancel, "failure cancels Undo")
history.TryBeginRecording = function() return nil end
check(not pcall(ImportAction.run, history, function() called = true end) and not called, "unavailable recording prevents import")
parent:Destroy()
env.services.ServerStorage:Destroy()
print("import: builder, re-import, pages, cache, cleanup, validation and Undo checks passed")
