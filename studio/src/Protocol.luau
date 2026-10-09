--!strict
-- Validate the relay contract before uploading assets or changing a place.
local Protocol = {}
local function positive(v: any): boolean
	return typeof(v) == "number" and v == v and v > 0 and v < math.huge
end
function Protocol.validateRelay(relay: string)
	local host, port = relay:match("^http://([%w%.]+):(%d+)$")
	if not host then port = relay:match("^http://%[::1%]:(%d+)$"); host = if port then "[::1]" else nil end
	assert((host == "127.0.0.1" or host == "localhost" or host == "[::1]") and port and tonumber(port) >= 1024 and tonumber(port) <= 65535, "Relay must be an HTTP loopback origin with a port in 1024..65535")
end
function Protocol.validate(payload: any)
	assert(typeof(payload) == "table" and typeof(payload.ir) == "table", "Invalid relay payload")
	local ir = payload.ir
	assert(ir.v == 1, "Unsupported IR version; update Figlo")
	assert(typeof(ir.design) == "table" and positive(ir.design.w) and positive(ir.design.h), "Invalid design dimensions")
	assert(typeof(ir.source) == "table" and typeof(ir.source.node) == "string" and typeof(ir.source.name) == "string", "Invalid source")
	assert(typeof(ir.root) == "table" and typeof(ir.root.name) == "string" and ir.root.kind == "frame", "Invalid root")
	assert(typeof(payload.images) == "table" and #payload.images <= 256, "Invalid image list")
	local keys = {}
	for _, im in payload.images do
		assert(typeof(im) == "table" and typeof(im.key) == "string" and not keys[im.key], "Invalid image key")
		keys[im.key] = true
		assert(typeof(im.sha) == "string" and #im.sha == 40 and not im.sha:find("[^0-9a-f]"), "Invalid image checksum")
		assert(positive(im.w) and positive(im.h) and im.w % 1 == 0 and im.h % 1 == 0 and im.w <= 1024 and im.h <= 1024, "Invalid image dimensions")
		assert(typeof(im.i) == "number" and im.i >= 0 and im.i % 1 == 0 and im.i < #payload.images, "Invalid image index")
	end
end
return Protocol
