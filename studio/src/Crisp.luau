--!strict
-- Sizes uploaded images to what they cover on screen.
--
-- Roblox mipmaps every uploaded image. Drawn smaller than its pixels, it blends in the
-- half-size level (smoothly, by how much smaller), so a 1x Figma export shown at 0.6x
-- looks soft next to Figma, which draws vectors at screen resolution. An image is
-- crispest when its pixels equal the pixels it covers, so the importer shrinks each
-- image to its size on a reference screen (the IR's `screen`, 1920 x 1080) with a
-- sharp filter before uploading it. It never enlarges: the Figma side already
-- exports small designs at up to 2x (extract.js, FF_SCREEN).
--
-- Kept as exported: images under `_native` (icon sheets whose ids code shows at
-- other sizes) and tiled fills.

local Crisp = {}

export type Screen = { w: number, h: number }
export type PixelSize = { w: number, h: number }

Crisp.DEFAULT_SCREEN = { w = 1920, h = 1080 } :: Screen
-- The top bar a ScreenGui without IgnoreGuiInset sits below.
Crisp.GUI_INSET = 58
-- Within this of the exported size, an image is left alone.
Crisp.SLACK = 0.97

-- Screen pixels per design pixel for a root of `size` that keeps the design's aspect
-- (Builder gives the root a UIAspectRatioConstraint) inside a `screen`-sized ScreenGui.
function Crisp.rootScale(size: UDim2, designW: number, designH: number, screen: Screen): number
	local boxW = size.X.Scale * screen.w + size.X.Offset
	local boxH = size.Y.Scale * screen.h + size.Y.Offset
	if boxW <= 0 or boxH <= 0 or designW <= 0 or designH <= 0 then
		return 1
	end
	local w = math.min(boxW, boxH * designW / designH)
	return w / designW
end

-- The factor (< 1) each image key should be shrunk by, for an IR drawn at `k` screen
-- pixels per design pixel. `sizes` holds the exported pixel size per key. Keys that
-- stay as they are have no entry.
function Crisp.scales(ir: any, k: number, sizes: { [string]: PixelSize }): { [string]: number }
	local need: { [string]: number } = {}
	local keep: { [string]: boolean } = {}
	local function walk(n: any)
		if n.kind == "image" and n.image then
			local key = n.image
			local px = sizes[key]
			if n.native or n.scale == "TILE" or not px or px.w <= 0 or px.h <= 0 then
				keep[key] = true
			else
				local sx = n.pw * k / px.w
				local sy = n.ph * k / px.h
				-- Fit shows the whole image inside the box; stretch and crop cover it.
				local s = if n.scale == "FIT" then math.min(sx, sy) else math.max(sx, sy)
				need[key] = math.max(need[key] or 0, s)
			end
		end
		if n.children then
			for _, c in n.children do
				walk(c)
			end
		end
	end
	walk(ir.root)
	local out: { [string]: number } = {}
	for key, s in need do
		if not keep[key] and s < Crisp.SLACK then
			out[key] = s
		end
	end
	return out
end

-- Pixel size after shrinking by `s`, at least 1 x 1.
function Crisp.shrunk(w: number, h: number, s: number): (number, number)
	return math.max(1, math.ceil(w * s - 1e-6)), math.max(1, math.ceil(h * s - 1e-6))
end

-- Catmull-Rom (Keys, a = -0.5): sharp, with a little overshoot that is clamped.
local function cubic(x: number): number
	x = math.abs(x)
	if x < 1 then
		return (1.5 * x - 2.5) * x * x + 1
	elseif x < 2 then
		return ((-0.5 * x + 2.5) * x - 4) * x + 2
	end
	return 0
end

type Taps = { first: { number }, count: { number }, weight: { number }, stride: number }

-- Filter taps from `n` source samples to `m` (m <= n), widened by n / m so every
-- source pixel counts.
local function taps(n: number, m: number): Taps
	local ratio = n / m
	local support = 2 * ratio
	local stride = math.ceil(2 * support) + 2
	local first, count, weight = table.create(m, 0), table.create(m, 0), table.create(m * stride, 0)
	for i = 0, m - 1 do
		local center = (i + 0.5) * ratio - 0.5
		local lo = math.ceil(center - support)
		local hi = math.floor(center + support)
		local total = 0
		local c = 0
		for j = lo, hi do
			local wgt = cubic((j - center) / ratio)
			if wgt ~= 0 then
				weight[i * stride + c + 1] = wgt
				total += wgt
			end
			c += 1
		end
		for t = 1, c do
			weight[i * stride + t] /= total
		end
		first[i + 1] = lo
		count[i + 1] = c
	end
	return { first = first, count = count, weight = weight, stride = stride }
end

local function clampi(v: number, lo: number, hi: number): number
	return if v < lo then lo elseif v > hi then hi else v
end

-- RGBA8 (straight alpha) `w` x `h` to `nw` x `nh`, no larger. Colours are filtered
-- premultiplied, so transparent pixels do not bleed dark fringes into edges.
function Crisp.resample(pixels: string, w: number, h: number, nw: number, nh: number): string
	assert(#pixels == w * h * 4, "pixel data does not match its size")
	assert(nw <= w and nh <= h, "Crisp.resample only shrinks")
	local src = buffer.fromstring(pixels)

	-- premultiplied floats
	local pre = buffer.create(w * h * 16)
	for p = 0, w * h - 1 do
		local a = buffer.readu8(src, p * 4 + 3)
		local f = a / 255
		buffer.writef32(pre, p * 16, buffer.readu8(src, p * 4) * f)
		buffer.writef32(pre, p * 16 + 4, buffer.readu8(src, p * 4 + 1) * f)
		buffer.writef32(pre, p * 16 + 8, buffer.readu8(src, p * 4 + 2) * f)
		buffer.writef32(pre, p * 16 + 12, a)
	end

	-- horizontal: w x h -> nw x h
	local tx = taps(w, nw)
	local mid = buffer.create(nw * h * 16)
	for y = 0, h - 1 do
		local row = y * w
		for i = 0, nw - 1 do
			local r, g, b, a = 0, 0, 0, 0
			local lo, base = tx.first[i + 1], i * tx.stride
			for t = 1, tx.count[i + 1] do
				local wgt = tx.weight[base + t]
				if wgt ~= 0 then
					local o = (row + clampi(lo + t - 1, 0, w - 1)) * 16
					r += buffer.readf32(pre, o) * wgt
					g += buffer.readf32(pre, o + 4) * wgt
					b += buffer.readf32(pre, o + 8) * wgt
					a += buffer.readf32(pre, o + 12) * wgt
				end
			end
			local o = (y * nw + i) * 16
			buffer.writef32(mid, o, r)
			buffer.writef32(mid, o + 4, g)
			buffer.writef32(mid, o + 8, b)
			buffer.writef32(mid, o + 12, a)
		end
	end

	-- vertical: nw x h -> nw x nh, back to straight RGBA8
	local ty = taps(h, nh)
	local out = buffer.create(nw * nh * 4)
	for j = 0, nh - 1 do
		local lo, base = ty.first[j + 1], j * ty.stride
		for x = 0, nw - 1 do
			local r, g, b, a = 0, 0, 0, 0
			for t = 1, ty.count[j + 1] do
				local wgt = ty.weight[base + t]
				if wgt ~= 0 then
					local o = (clampi(lo + t - 1, 0, h - 1) * nw + x) * 16
					r += buffer.readf32(mid, o) * wgt
					g += buffer.readf32(mid, o + 4) * wgt
					b += buffer.readf32(mid, o + 8) * wgt
					a += buffer.readf32(mid, o + 12) * wgt
				end
			end
			local o = (j * nw + x) * 4
			a = clampi(a, 0, 255)
			if a < 0.5 then
				buffer.writeu32(out, o, 0)
			else
				local k = 255 / a
				buffer.writeu8(out, o, clampi(math.floor(r * k + 0.5), 0, 255))
				buffer.writeu8(out, o + 1, clampi(math.floor(g * k + 0.5), 0, 255))
				buffer.writeu8(out, o + 2, clampi(math.floor(b * k + 0.5), 0, 255))
				buffer.writeu8(out, o + 3, math.floor(a + 0.5))
			end
		end
	end
	return buffer.tostring(out)
end

return Crisp
