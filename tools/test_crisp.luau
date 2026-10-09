-- Checks studio/src/Crisp.luau: the root scale, which images shrink, and the resampler.
-- lune run tools/test_crisp
local fs = require("@lune/fs")
local luau = require("@lune/luau")

local Crisp = luau.load(fs.readFile("studio/src/Crisp.luau"), { debugName = "Crisp" })()

local function udim2(sx: number, ox: number, sy: number, oy: number): any
	return { X = { Scale = sx, Offset = ox }, Y = { Scale = sy, Offset = oy } }
end

local function near(a: number, b: number, eps: number?): boolean
	return math.abs(a - b) <= (eps or 1e-6)
end

local screen = { w = 1920, h = 1080 }

-- A full root fits the screen's height when the design is narrower than 16:9.
assert(near(Crisp.rootScale(udim2(1, 0, 1, 0), 1622.25, 1297.8, screen), 1080 / 1297.8), "height-bound root")
-- ... and its width when it is wider.
assert(near(Crisp.rootScale(udim2(1, 0, 1, 0), 3000, 1000, screen), 1920 / 3000), "width-bound root")
-- A root resized in Studio: a quarter of the screen's height.
assert(near(Crisp.rootScale(udim2(0.25, 0, 0.25, 0), 400, 400, screen), 270 / 400), "resized root")
-- Offsets count.
assert(near(Crisp.rootScale(udim2(0, 200, 0, 100), 400, 200, screen), 0.5), "offset root")

-- Which images shrink.
local ir = {
	root = {
		kind = "frame",
		children = {
			{ kind = "image", image = "a", pw = 200, ph = 100 }, -- shown at 100 x 50
			{ kind = "image", image = "b", pw = 200, ph = 100, native = true },
			{ kind = "image", image = "c", pw = 200, ph = 100, scale = "TILE" },
			{ kind = "frame", children = {
				{ kind = "image", image = "d", pw = 100, ph = 100 }, -- used twice:
				{ kind = "image", image = "d", pw = 300, ph = 300 }, -- the bigger use wins
			} },
			{ kind = "image", image = "e", pw = 100, ph = 100, scale = "FIT" }, -- 400 x 200 fit in 50 x 50
			{ kind = "image", image = "f", pw = 100, ph = 100, scale = "FILL" }, -- 400 x 200 cover 50 x 50
			{ kind = "image", image = "g", pw = 400, ph = 400 }, -- already smaller than shown
		},
	},
}
local sizes = {
	a = { w = 200, h = 100 },
	b = { w = 200, h = 100 },
	c = { w = 64, h = 64 },
	d = { w = 300, h = 300 },
	e = { w = 400, h = 200 },
	f = { w = 400, h = 200 },
	g = { w = 100, h = 100 },
}
local s = Crisp.scales(ir, 0.5, sizes)
assert(near(s.a, 0.5), "a shrinks to half")
assert(s.b == nil, "_native keeps its pixels")
assert(s.c == nil, "a tiled fill keeps its pixels")
assert(near(s.d, 0.5), "the bigger of two uses wins")
assert(near(s.e, 50 / 400), "fit shrinks by the smaller ratio")
assert(near(s.f, 50 / 200), "fill shrinks by the larger ratio")
assert(s.g == nil, "nothing is enlarged")
local w, h = Crisp.shrunk(200, 100, 0.5)
assert(w == 100 and h == 50, "shrunk size")

-- The resampler.
local function image(w: number, h: number, f: (number, number) -> (number, number, number, number)): string
	local b = buffer.create(w * h * 4)
	for y = 0, h - 1 do
		for x = 0, w - 1 do
			local r, g, bl, a = f(x, y)
			local o = (y * w + x) * 4
			buffer.writeu8(b, o, r)
			buffer.writeu8(b, o + 1, g)
			buffer.writeu8(b, o + 2, bl)
			buffer.writeu8(b, o + 3, a)
		end
	end
	return buffer.tostring(b)
end
local function px(data: string, w: number, x: number, y: number): (number, number, number, number)
	local o = (y * w + x) * 4
	return data:byte(o + 1, o + 4)
end

-- A flat colour stays flat.
do
	local out = Crisp.resample(image(37, 23, function()
		return 200, 100, 50, 255
	end), 37, 23, 20, 13)
	assert(#out == 20 * 13 * 4, "output size")
	for y = 0, 12 do
		for x = 0, 19 do
			local r, g, b, a = px(out, 20, x, y)
			assert(r == 200 and g == 100 and b == 50 and a == 255, "flat colour drifted")
		end
	end
end

-- Transparent pixels do not darken an edge: red on clear keeps pure red.
do
	local out = Crisp.resample(image(40, 40, function(x)
		if x < 20 then
			return 255, 0, 0, 255
		end
		return 0, 0, 0, 0
	end), 40, 40, 27, 27)
	for x = 0, 26 do
		local r, g, b, a = px(out, 27, x, 13)
		if a > 8 then
			assert(r >= 250 and g == 0 and b == 0, ("edge fringe at %d: %d %d %d %d"):format(x, r, g, b, a))
		end
	end
end

-- A hard edge stays hard: at 0.8x, a black/white step is at most 2 pixels wide.
do
	local out = Crisp.resample(image(100, 4, function(x)
		local v = if x < 50 then 0 else 255
		return v, v, v, 255
	end), 100, 4, 80, 4)
	local mixed = 0
	for x = 0, 79 do
		local r = px(out, 80, x, 1)
		if r > 10 and r < 245 then
			mixed += 1
		end
	end
	assert(mixed <= 2, "edge spread over " .. mixed .. " pixels")
end

-- Halving 1-pixel stripes averages them (no aliasing to solid black or white).
do
	local out = Crisp.resample(image(64, 2, function(x)
		local v = if x % 2 == 0 then 255 else 0
		return v, v, v, 255
	end), 64, 2, 32, 2)
	for x = 2, 29 do
		local r = px(out, 32, x, 0)
		assert(r > 100 and r < 155, "stripes alias to " .. r)
	end
end

print("crisp: all checks passed")
