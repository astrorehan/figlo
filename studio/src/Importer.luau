--!strict
-- Pulls one export from the local relay by code, uploads its images and builds the UI.

local AssetService = game:GetService("AssetService")
local HttpService = game:GetService("HttpService")

local Builder = require(script.Parent.Builder)

local Importer = {}

export type Options = {
	relay: string?, -- default http://127.0.0.1:34880
	parent: Instance,
	runtime: Instance?,
	client: Instance?,
	cache: { [string]: string }?, -- pixel sha1 -> rbxassetid, reused across imports
	log: ((string) -> ())?,
}

local DEFAULT_RELAY = "http://127.0.0.1:34880"
local UPLOAD_RETRIES = 4

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
		lastErr = if ok then tostring(result) else tostring(result)
		-- 30 uploads/minute: back off and retry.
		task.wait(2 * attempt)
	end
	img:Destroy()
	error(("upload of %s failed: %s"):format(name, lastErr))
end

function Importer.run(code: string, opts: Options): (ScreenGui, { string })
	local relay = opts.relay or DEFAULT_RELAY
	local log = opts.log or function(_: string) end
	local cache = opts.cache or {}
	code = code:upper():gsub("%s", "")

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
	local old = opts.parent:FindFirstChild(name)
	local gui, warnings = Builder.build(ir, {
		images = images,
		imageSizes = imageSizes,
		parent = opts.parent,
		name = name,
		runtime = opts.runtime,
		client = opts.client,
	})
	if old and old:IsA("ScreenGui") then
		gui.Enabled = old.Enabled
		old:Destroy()
	end
	if opts.runtime then
		-- Size text for the current viewport once layout has run.
		task.wait()
		require(opts.runtime :: any).apply(gui)
	end
	log(("Done: %s (%d warnings)"):format(name, #warnings))
	return gui, warnings
end

return Importer
