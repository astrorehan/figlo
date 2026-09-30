--!strict
-- Pulls one export from the local relay by code, uploads its images and builds the UI.
--
-- An import lands in a "container": a ScreenGui, or a Folder holding one page of a
-- ScreenGui with several pages. The container carries FF_Root (the root's name),
-- FF_DesignW/H and FF_Source (figma file/node). Re-importing the same Figma node finds
-- its container by FF_Source and swaps only the root inside it, so everything else
-- (ScreenGui settings, other pages, runtime, objects added by hand next to the root)
-- stays. Values changed in Studio on the old root are carried to the new one.

local AssetService = game:GetService("AssetService")
local ContentProvider = game:GetService("ContentProvider")
local HttpService = game:GetService("HttpService")
local ServerStorage = game:GetService("ServerStorage")

local Builder = require(script.Parent.Builder)

local Importer = {}

export type Options = {
	relay: string?, -- default http://127.0.0.1:34880
	parent: Instance, -- where a new ScreenGui goes (StarterGui); also searched for an earlier import
	into: Instance?, -- a FrameFig ScreenGui: add (or update) the frame as a page Folder inside it
	runtime: Instance?,
	client: Instance?,
	cache: { [string]: string }?, -- pixel sha1 -> rbxassetid, reused across imports
	log: ((string) -> ())?,
	backup: Instance | false | nil, -- where replaced roots go (default ServerStorage.FrameFigBackups)
	checkImages: boolean?, -- ask Roblox whether every image loads (default true)
}

local DEFAULT_RELAY = "http://127.0.0.1:34880"
local UPLOAD_RETRIES = 4
local IMAGE_CHECK_TIMEOUT = 20

-- Attributes that describe the build itself; they are rewritten on every import and
-- never count as a Studio override.
local STRUCTURAL = {
	FF_Id = true,
	FF_DesignSize = true,
	FF_BaseSize = true,
	FF_TextPx = true,
	FF_TextScale = true,
	FF_StrokePx = true,
	FF_Tags = true,
	FF_Root = true,
	FF_DesignW = true,
	FF_DesignH = true,
	FF_Source = true,
	FF_Imported = true,
}

local ROOT_PROPS = { "AnchorPoint", "Position", "Size", "Visible" }

local function upload(name: string, w: number, h: number, pixels: string): string
	local img = AssetService:CreateEditableImage({ Size = Vector2.new(w, h) })
	img:WritePixelsBuffer(Vector2.zero, img.Size, buffer.fromstring(pixels))
	local lastErr = "unknown"
	for attempt = 1, UPLOAD_RETRIES do
		local ok, result, id = pcall(function()
			return AssetService:CreateAssetAsync(img, Enum.AssetType.Image, {
				Name = name:sub(1, 50),
				Description = "FrameFig export",
			})
		end)
		if ok and result == Enum.CreateAssetResult.Success then
			img:Destroy()
			return "rbxassetid://" .. tostring(id)
		end
		lastErr = tostring(result)
		-- 30 uploads/minute: back off and retry.
		task.wait(2 * attempt)
	end
	img:Destroy()
	error(("upload of %s failed: %s"):format(name, lastErr))
end

-- --- overrides ------------------------------------------------------------------

-- JSON cannot hold Roblox types; property values are stored as tagged arrays.
local function encode(v: any): any
	local t = typeof(v)
	if t == "UDim2" then
		return { "U2", v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset }
	elseif t == "Vector2" then
		return { "V2", v.X, v.Y }
	end
	return v
end

local function same(a: any, b: any): boolean
	if typeof(a) == "number" and typeof(b) == "number" then
		return math.abs(a - b) < 1e-4
	end
	if typeof(a) == "table" and typeof(b) == "table" then
		if #a ~= #b then
			return false
		end
		for i = 1, #a do
			if not same(a[i], b[i]) then
				return false
			end
		end
		return true
	end
	return a == b
end

local function nodeKey(obj: Instance): string?
	local id = obj:GetAttribute("FF_Id")
	if typeof(id) ~= "string" then
		return nil
	end
	return id .. "|" .. obj.Name
end

-- What the import set, per node: the FF_* effect attributes, plus the root's placement.
local function snapshot(root: GuiObject): { [string]: any }
	local snap: { [string]: any } = {}
	local function take(obj: Instance)
		local key = nodeKey(obj)
		if not key then
			return
		end
		local attrs = {}
		for name, value in obj:GetAttributes() do
			if name:sub(1, 3) == "FF_" and not STRUCTURAL[name] then
				attrs[name] = value
			end
		end
		if next(attrs) then
			snap[key] = attrs
		end
	end
	take(root)
	for _, d in root:GetDescendants() do
		take(d)
	end
	local props = {}
	for _, p in ROOT_PROPS do
		props[p] = encode((root :: any)[p])
	end
	snap["@root"] = props
	return snap
end

local function readSnapshot(container: Instance): { [string]: any }?
	local raw = container:GetAttribute("FF_Imported")
	if typeof(raw) ~= "string" then
		return nil
	end
	local ok, decoded = pcall(HttpService.JSONDecode, HttpService, raw)
	return if ok then decoded else nil
end

-- Carries what was changed in Studio on the old root to the new one. Without a
-- snapshot (an import made before snapshots existed) every differing value counts
-- as a Studio change.
local function carryOverrides(oldRoot: GuiObject, newRoot: GuiObject, snap: { [string]: any }?, log: (string) -> ()): number
	local newByKey: { [string]: Instance } = {}
	local function index(obj: Instance)
		local key = nodeKey(obj)
		if key and not newByKey[key] then
			newByKey[key] = obj
		end
	end
	index(newRoot)
	for _, d in newRoot:GetDescendants() do
		index(d)
	end

	local carried = 0
	local function carry(old: Instance)
		local key = nodeKey(old)
		local new = key and newByKey[key]
		if not new then
			return
		end
		local imported = snap and snap[key :: string] or nil
		for name, value in old:GetAttributes() do
			if name:sub(1, 3) ~= "FF_" or STRUCTURAL[name] then
				continue
			end
			local changed
			if snap then
				changed = imported == nil or not same(imported[name], value)
			else
				changed = not same(new:GetAttribute(name), value)
			end
			if changed and not same(new:GetAttribute(name), value) then
				new:SetAttribute(name, value)
				carried += 1
			end
		end
	end
	carry(oldRoot)
	for _, d in oldRoot:GetDescendants() do
		carry(d)
	end

	local rootSnap = snap and snap["@root"]
	for _, p in ROOT_PROPS do
		local oldValue = (oldRoot :: any)[p]
		local changed = if rootSnap then not same(rootSnap[p], encode(oldValue)) else not same(encode(oldValue), encode((newRoot :: any)[p]))
		if changed and not same(encode(oldValue), encode((newRoot :: any)[p])) then
			(newRoot :: any)[p] = oldValue
			carried += 1
		end
	end
	if carried > 0 then
		log(("Kept %d value(s) changed in Studio"):format(carried))
	end
	return carried
end

-- --- containers -----------------------------------------------------------------

local function isContainer(obj: Instance): boolean
	return (obj:IsA("ScreenGui") or obj:IsA("Folder")) and typeof(obj:GetAttribute("FF_Root")) == "string"
end

local function sourceOf(ir: any): string
	return (ir.source.file or "?") .. "/" .. ir.source.node
end

-- The earlier import of this Figma node, if any: a container with the same FF_Source,
-- inside `into` when importing a page, else anywhere under `parent`.
local function findContainer(ir: any, opts: Options, name: string): Instance?
	local source = sourceOf(ir)
	local scope = opts.into or opts.parent
	local function match(obj: Instance): boolean
		return isContainer(obj) and obj:GetAttribute("FF_Source") == source
	end
	if match(scope) then
		return scope
	end
	for _, d in scope:GetDescendants() do
		if match(d) then
			return d
		end
	end
	if not opts.into then
		-- Imports made by name only (same frame, different file copy).
		local byName = opts.parent:FindFirstChild(name)
		if byName and isContainer(byName) and byName:GetAttribute("FF_Root") == ir.root.name then
			return byName
		end
	end
	return nil
end

local function stamp(container: Instance, ir: any)
	container:SetAttribute("FF_DesignW", ir.design.w)
	container:SetAttribute("FF_DesignH", ir.design.h)
	container:SetAttribute("FF_Root", ir.root.name)
	container:SetAttribute("FF_Source", sourceOf(ir))
end

local function saveSnapshot(container: Instance, root: GuiObject, log: (string) -> ())
	local ok, err = pcall(function()
		container:SetAttribute("FF_Imported", HttpService:JSONEncode(snapshot(root)))
	end)
	if not ok then
		log("Could not store the import snapshot: " .. tostring(err))
	end
end

local function backupFolder(opts: Options): Instance?
	if opts.backup == false then
		return nil
	end
	if opts.backup then
		return opts.backup :: any
	end
	local folder = ServerStorage:FindFirstChild("FrameFigBackups")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "FrameFigBackups"
		folder.Parent = ServerStorage
	end
	return folder
end

-- Keeps the replaced root (one per source), so hand edits inside it are not lost.
local function backup(old: GuiObject, container: Instance, opts: Options)
	local folder = backupFolder(opts)
	if not folder then
		old:Destroy()
		return
	end
	local source = tostring(container:GetAttribute("FF_Source"))
	for _, prev in folder:GetChildren() do
		if prev:GetAttribute("FF_Source") == source then
			prev:Destroy()
		end
	end
	local holder = Instance.new("Folder")
	holder.Name = container.Name .. " (" .. os.date("!%Y-%m-%d %H:%M") .. " UTC)"
	holder:SetAttribute("FF_Source", source)
	holder:SetAttribute("FF_From", container:GetFullName())
	old.Parent = holder
	holder.Parent = folder
end

-- Puts a fresh runtime (and the stock client, unless the container has its own) in a ScreenGui.
local function installRuntime(gui: Instance, opts: Options)
	if not gui:IsA("ScreenGui") then
		return
	end
	if opts.runtime then
		local old = gui:FindFirstChild("FrameFigRuntime")
		if old then
			old:Destroy()
		end
		local rt = opts.runtime:Clone()
		rt.Name = "FrameFigRuntime"
		rt.Parent = gui
	end
	if opts.client then
		local old = gui:FindFirstChild("FrameFigClient")
		local stock = old
			and old:IsA("LocalScript")
			and (old :: any).Source:find("FrameFig", 1, true) ~= nil
			and (old :: any).Source:find("Runtime\")).watch(script.Parent)", 1, true) ~= nil
		if old and not stock and old:GetAttribute("FF_Stock") ~= true then
			return -- a hand-written client; leave it
		end
		if old then
			old:Destroy()
		end
		local cl = opts.client:Clone()
		cl.Name = "FrameFigClient"
		cl:SetAttribute("FF_Stock", true)
		cl.Parent = gui
	end
end

-- Asks Roblox for every image; returns the ids that do not load yet (usually new
-- uploads still in moderation).
local function unloadable(ids: { string }): ({ string }, boolean)
	if #ids == 0 then
		return {}, true
	end
	local failed: { string } = {}
	local done = false
	task.spawn(function()
		pcall(function()
			ContentProvider:PreloadAsync(ids, function(id, status)
				if status ~= Enum.AssetFetchStatus.Success then
					table.insert(failed, id)
				end
			end)
		end)
		done = true
	end)
	local t0 = os.clock()
	while not done and os.clock() - t0 < IMAGE_CHECK_TIMEOUT do
		task.wait(0.2)
	end
	return failed, done
end

-- --- import ---------------------------------------------------------------------

function Importer.run(code: string, opts: Options): (Instance, { string })
	local relay = opts.relay or DEFAULT_RELAY
	local log = opts.log or function(_: string) end
	local cache = opts.cache or {}
	code = code:upper():gsub("%s", "")
	if opts.into and not (opts.into:IsA("ScreenGui") or isContainer(opts.into)) then
		error("`into` must be a ScreenGui built by FrameFig")
	end

	log("Fetching " .. code .. "…")
	local ok, body = pcall(HttpService.GetAsync, HttpService, ("%s/pull/%s"):format(relay, code))
	if not ok then
		error("Cannot reach the FrameFig relay (is it running?) or the code is wrong: " .. tostring(body))
	end
	local payload = HttpService:JSONDecode(body)
	local ir = payload.ir

	local images: { [string]: string } = {}
	local imageSizes: { [string]: Vector2 } = {}
	for n, im in payload.images do
		if im.nw and im.nh then
			imageSizes[im.key] = Vector2.new(im.nw, im.nh)
		else
			imageSizes[im.key] = Vector2.new(im.w, im.h)
		end
		local cached = cache[im.sha]
		if cached then
			images[im.key] = cached
			log(("Image %d/%d cached"):format(n, #payload.images))
		else
			log(("Uploading image %d/%d (%dx%d)…"):format(n, #payload.images, im.w, im.h))
			local pixels = HttpService:GetAsync(("%s/img/%s/%d"):format(relay, code, im.i))
			assert(#pixels == im.w * im.h * 4, "image data truncated for " .. im.key)
			local id = upload(ir.source.name .. " " .. im.key, im.w, im.h, pixels)
			cache[im.sha] = id
			images[im.key] = id
		end
	end

	log("Building…")
	local name = "FrameFig_" .. ir.root.name
	local temp, warnings = Builder.build(ir, {
		images = images,
		imageSizes = imageSizes,
		parent = nil :: any,
		name = name,
	})
	local newRoot = temp:FindFirstChild(ir.root.name) :: GuiObject

	local container = findContainer(ir, opts, name)
	if container then
		-- Update in place: swap the root, keep the rest.
		local oldRoot = container:FindFirstChild(tostring(container:GetAttribute("FF_Root")))
		if oldRoot and oldRoot:IsA("GuiObject") then
			carryOverrides(oldRoot, newRoot, readSnapshot(container), log)
			-- Which page shows is the game's (or the author's) business, never the import's.
			newRoot.Visible = oldRoot.Visible
			newRoot.Parent = container
			backup(oldRoot, container, opts)
		else
			newRoot.Parent = container
		end
		stamp(container, ir)
		log("Updated " .. container:GetFullName())
	elseif opts.into then
		local page = Instance.new("Folder")
		page.Name = ir.root.name
		stamp(page, ir)
		-- The first page shows; later ones wait for the game to switch to them. A
		-- ScreenGui that is an import itself already has its first page.
		local hasPage = isContainer(opts.into)
		for _, c in opts.into:GetChildren() do
			if isContainer(c) then
				hasPage = true
			end
		end
		newRoot.Visible = not hasPage
		newRoot.Parent = page
		page.Parent = opts.into
		container = page
		log("Added page " .. page:GetFullName())
	else
		local gui = Instance.new("ScreenGui")
		gui.Name = name
		gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
		gui.IgnoreGuiInset = true
		gui.ResetOnSpawn = false
		stamp(gui, ir)
		newRoot.Parent = gui
		gui.Parent = opts.parent
		container = gui
	end
	temp:Destroy()
	local target = container :: Instance
	saveSnapshot(target, newRoot, log)

	local gui = if target:IsA("ScreenGui") then target else target:FindFirstAncestorWhichIsA("ScreenGui")
	if gui then
		installRuntime(gui, opts)
	end

	if opts.checkImages ~= false then
		local ids, seen = {}, {}
		for _, id in images do
			if not seen[id] then
				seen[id] = true
				table.insert(ids, id)
			end
		end
		log(("Checking %d image(s)…"):format(#ids))
		local failed, finished = unloadable(ids)
		if #failed > 0 then
			table.insert(
				warnings,
				("%d image(s) do not load yet (%s%s). New uploads wait for Roblox moderation and appear on their own; do not re-upload."):format(
					#failed,
					table.concat(failed, " ", 1, math.min(#failed, 3)),
					if #failed > 3 then " …" else ""
				)
			)
		elseif not finished then
			table.insert(warnings, "Image check timed out; some images may still be in moderation.")
		end
	end

	-- Size text for the current viewport once layout has run (no scripts run in Edit).
	local runtime = gui and gui:FindFirstChild("FrameFigRuntime")
	if runtime and runtime:IsA("ModuleScript") then
		task.wait()
		pcall(function()
			require(runtime :: any).apply(target)
		end)
	end
	log(("Done: %s (%d warnings)"):format(target:GetFullName(), #warnings))
	return target, warnings
end

-- Runs an import in its own thread (for callers with a time limit) and reports on
-- `status` (default: the folder holding this module) through attributes:
-- FrameFigStatus = "running" | "done" | "failed: …", FrameFigLog (recent lines),
-- FrameFigResult (full name of the container), FrameFigWarnings (one per line).
function Importer.start(code: string, opts: Options & { status: Instance? })
	local status = opts.status or script.Parent
	local lines: { string } = {}
	local userLog = opts.log
	local function log(line: string)
		table.insert(lines, line)
		if #lines > 40 then
			table.remove(lines, 1)
		end
		status:SetAttribute("FrameFigLog", table.concat(lines, "\n"))
		if userLog then
			userLog(line)
		end
	end
	status:SetAttribute("FrameFigStatus", "running")
	status:SetAttribute("FrameFigResult", nil)
	status:SetAttribute("FrameFigWarnings", nil)
	status:SetAttribute("FrameFigLog", "")
	local runOpts = table.clone(opts) :: any
	runOpts.log = log
	task.spawn(function()
		local ok, result, warnings = pcall(Importer.run, code, runOpts)
		if ok then
			status:SetAttribute("FrameFigResult", result:GetFullName())
			status:SetAttribute("FrameFigWarnings", table.concat(warnings, "\n"))
			status:SetAttribute("FrameFigStatus", "done")
		else
			status:SetAttribute("FrameFigStatus", "failed: " .. tostring(result))
		end
	end)
end

return Importer
