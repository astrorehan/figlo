-- Compiles every .luau file under studio/src to catch syntax errors before building.
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local failed = 0
local function walk(dir: string)
	for _, name in fs.readDir(dir) do
		local path = dir .. "/" .. name
		if fs.isDir(path) then
			walk(path)
		elseif name:match("%.luau$") then
			local ok, err = pcall(luau.compile, fs.readFile(path))
			print((ok and "ok   " or "FAIL ") .. path .. (ok and "" or ("\n  " .. tostring(err))))
			if not ok then
				failed += 1
			end
		end
	end
end
walk("studio/src")
if failed > 0 then
	error(failed .. " file(s) failed")
end
