--!strict
-- Include source shape, output shape and owner in every key, including unscaled images.
local ImageKey = {}
function ImageKey.make(sha: string, sourceW: number, sourceH: number, w: number, h: number, owner: string): string
	return ("v2:%s:%s@%dx%d>%dx%d"):format(owner, sha, sourceW, sourceH, w, h)
end
return ImageKey
