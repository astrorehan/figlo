--!strict
-- Figlo builder: turns Figlo IR (from figma/extract.js) into Roblox UI.
-- Every position and size is Scale-based, relative to the parent, with
-- AnchorPoint 0.5 so rotation pivots match Figma.

local TextService = game:GetService("TextService")

local FontMetrics = require(script.Parent.FontMetrics)

local Builder = {}

export type Options = {
	images: { [string]: string }, -- IR image key -> "rbxassetid://..."
	imageSizes: { [string]: Vector2 }?, -- source pixel size for tiled image fills
	parent: Instance,
	name: string?,
	runtime: ModuleScript?, -- FigloRuntime to embed
	client: LocalScript?, -- FigloClient to embed
}

local WEIGHTS = {
	thin = Enum.FontWeight.Thin,
	hairline = Enum.FontWeight.Thin,
	extralight = Enum.FontWeight.ExtraLight,
	ultralight = Enum.FontWeight.ExtraLight,
	light = Enum.FontWeight.Light,
	regular = Enum.FontWeight.Regular,
	normal = Enum.FontWeight.Regular,
	book = Enum.FontWeight.Regular,
	medium = Enum.FontWeight.Medium,
	semibold = Enum.FontWeight.SemiBold,
	demibold = Enum.FontWeight.SemiBold,
	bold = Enum.FontWeight.Bold,
	extrabold = Enum.FontWeight.ExtraBold,
	ultrabold = Enum.FontWeight.ExtraBold,
	black = Enum.FontWeight.Heavy,
	heavy = Enum.FontWeight.Heavy,
}

local ALIGN_X = {
	LEFT = Enum.TextXAlignment.Left,
	CENTER = Enum.TextXAlignment.Center,
	RIGHT = Enum.TextXAlignment.Right,
	JUSTIFIED = Enum.TextXAlignment.Left,
}

local STROKE_POSITION = {
	INSIDE = Enum.BorderStrokePosition.Inner,
	CENTER = Enum.BorderStrokePosition.Center,
	OUTSIDE = Enum.BorderStrokePosition.Outer,
}

local function rgb(c: { number }): Color3
	return Color3.new(c[1], c[2], c[3])
end

local function resolveFont(family: string, style: string)
	local fam = FontMetrics[family]
	if not fam then
		return nil
	end
	local key = string.lower(style):gsub("[%s%-_]", "")
	local italic = key:find("italic") ~= nil or key:find("oblique") ~= nil
	key = key:gsub("italic", ""):gsub("oblique", "")
	local weight = WEIGHTS[key] or Enum.FontWeight.Regular
	local best, bestDist = fam.faces[1], math.huge
	for _, face in fam.faces do
		local dist = math.abs(face.weight - weight.Value) + ((face.style == "italic") ~= italic and 1000 or 0)
		if dist < bestDist then
			best, bestDist = face, dist
		end
	end
	local font = Font.new(
		"rbxasset://fonts/families/" .. fam.id .. ".json",
		weight,
		italic and Enum.FontStyle.Italic or Enum.FontStyle.Normal
	)
	return font, best
end

local function gradient(g: any, alpha: number): UIGradient
	local ui = Instance.new("UIGradient")
	ui.Rotation = g.rot
	local colors, transparency = {}, {}
	for _, k in g.keys do
		table.insert(colors, ColorSequenceKeypoint.new(k[1], Color3.new(k[2], k[3], k[4])))
		table.insert(transparency, NumberSequenceKeypoint.new(k[1], 1 - k[5] * alpha))
	end
	ui.Color = ColorSequence.new(colors)
	ui.Transparency = NumberSequence.new(transparency)
	return ui
end

local function corner(parent: Instance, radius: number, w: number, h: number)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(math.min(radius / math.min(w, h), 0.5), 0)
	c.Parent = parent
end

local function borderStroke(parent: Instance, stroke: any, w: number, h: number, opacity: number)
	local s = Instance.new("UIStroke")
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.StrokeSizingMode = Enum.StrokeSizingMode.ScaledSize
	s.BorderStrokePosition = STROKE_POSITION[stroke.align] or Enum.BorderStrokePosition.Center
	s.Thickness = stroke.w / math.min(w, h)
	s.Color = rgb(stroke.c)
	s.Transparency = 1 - stroke.a * opacity
	s.Parent = parent
end

local function applyTags(inst: Instance, tags: any)
	if not tags then
		return
	end
	local names = {}
	for tag, value in tags do
		table.insert(names, tag)
		inst:SetAttribute("FF_" .. tag, if value == true then true else tostring(value))
	end
	table.sort(names)
	inst:SetAttribute("FF_Tags", table.concat(names, ","))
end

-- Effect values from the Figma Effects tab, e.g. FF_drift_speed = 40. Editable in Studio.
local function applyFx(inst: Instance, fx: any)
	if not fx then
		return
	end
	for tag, values in fx do
		for key, value in values do
			inst:SetAttribute(("FF_%s_%s"):format(tag, key), value)
		end
	end
end

-- Common placement: centre-anchored, Scale-only, parent-relative.
local function place(inst: GuiObject, n: any, z: number)
	inst.Name = n.name
	inst.AnchorPoint = Vector2.new(0.5, 0.5)
	inst.Position = UDim2.fromScale(n.x, n.y)
	inst.Size = UDim2.fromScale(n.w, n.h)
	inst.Rotation = n.rot or 0
	inst.ZIndex = z
	inst.BorderSizePixel = 0
	inst.BackgroundTransparency = 1
	inst:SetAttribute("FF_Id", n.id)
	inst:SetAttribute("FF_DesignSize", Vector2.new(n.pw, n.ph))
	applyTags(inst, n.tags)
	applyFx(inst, n.fx)
end

local function fill(inst: GuiObject, f: any, opacity: number)
	if not f then
		return
	end
	if f.grad then
		inst.BackgroundColor3 = Color3.new(1, 1, 1)
		inst.BackgroundTransparency = 1 - opacity
		gradient(f.grad, 1).Parent = inst
	else
		inst.BackgroundColor3 = rgb(f.c)
		inst.BackgroundTransparency = 1 - f.a * opacity
	end
end

local function measureWidth(text: string, font: Font): number
	local params = Instance.new("GetTextBoundsParams")
	params.Text = text
	params.Font = font
	params.Size = 100
	params.Width = 100000
	local ok, bounds = pcall(TextService.GetTextBoundsAsync, TextService, params)
	return if ok then bounds.X else 0
end

-- Places a text node so its first baseline lands where Figma draws it.
-- Figma: each line box is L tall with the glyphs centred (half-leading on top).
-- Roblox (TextYAlignment.Top): baseline sits at base*TextSize from the top,
-- extra LineHeight only goes between lines.
local function buildText(n: any, parent: any, z: number, warnings: { string }): { GuiObject }
	local t = n.text
	local font, face = resolveFont(t.family, t.style)
	if not font then
		table.insert(warnings, ("%s: font %q is not built into Roblox"):format(n.name, t.family))
		font, face = resolveFont("Source Sans Pro", t.style)
	end
	local s = t.size
	local lineEm = face.line
	local L = if t.lineHeight.px then t.lineHeight.px else lineEm * s
	local lines = math.max(t.hardLines, math.round(t.inkH / L))
	local wrapped = lines > t.hardLines

	-- Width match for single lines: Figma ink width vs Roblox advance width.
	local wf = 1
	if not wrapped then
		local w100 = measureWidth(t.value, font)
		if w100 > 0 then
			local robloxW = w100 * lineEm * s / 100
			wf = math.clamp(t.inkW / robloxW, 0.9, 1.1)
		end
	end
	local textPx = lineEm * s * wf

	local blockH = lines * L
	local top = if t.alignY == "CENTER" then (n.ph - blockH) / 2 elseif t.alignY == "BOTTOM" then n.ph - blockH else 0
	local figmaBase = top + (L - lineEm * s) / 2 + face.ascEm * s
	local robloxBase = face.base * textPx
	local dy = figmaBase - robloxBase

	local width = n.w
	if wrapped and t.alignX == "CENTER" then
		width *= 1.02
	end

	-- Figma lets text overflow a fixed box; Roblox drops wrapped lines that do not
	-- fit. Grow the box downward (top stays put) until every line fits.
	local boxH = math.max(n.ph, blockH + L * 0.5)
	dy += (boxH - n.ph) / 2

	local opacity = n.opacity or 1
	local function make(offsetX: number, offsetY: number, shadow: any?): TextLabel
		local label: any = Instance.new(if n.button and not shadow then "TextButton" else "TextLabel")
		place(label, n, z)
		local r = math.rad(n.rot or 0)
		local ox = offsetX - math.sin(r) * dy
		local oy = offsetY + math.cos(r) * dy
		label.Position = UDim2.fromScale(n.x + ox / parent.pw, n.y + oy / parent.ph)
		label.Size = UDim2.fromScale(width, n.h * boxH / n.ph)
		label:SetAttribute("FF_BaseSize", label.Size)
		label.Text = t.value
		label.FontFace = font
		label.TextSize = math.clamp(math.floor(textPx), 1, 100)
		label:SetAttribute("FF_TextPx", textPx)
		label.TextXAlignment = ALIGN_X[t.alignX] or Enum.TextXAlignment.Left
		label.TextYAlignment = Enum.TextYAlignment.Top
		label.TextWrapped = wrapped
		label.LineHeight = L / (lineEm * s)
		label.RichText = false
		if label:IsA("TextButton") then
			label.AutoButtonColor = false
		end
		local f = t.fill
		if shadow then
			label.Name ..= "Shadow"
			label.TextColor3 = rgb(shadow.c)
			label.TextTransparency = 1 - shadow.a * opacity
			-- The copy under the text carries no tags: effects belong to the text itself.
			for key in label:GetAttributes() do
				if key ~= "FF_Id" and key ~= "FF_BaseSize" and key ~= "FF_TextPx" then
					label:SetAttribute(key, nil)
				end
			end
		elseif f and f.grad then
			label.TextColor3 = Color3.new(1, 1, 1)
			label.TextTransparency = 1 - opacity
			gradient(f.grad, 1).Parent = label
		elseif f then
			label.TextColor3 = rgb(f.c)
			label.TextTransparency = 1 - f.a * opacity
		else
			label.TextTransparency = 1
		end
		if t.rich and not shadow then
			-- Colour-only mix from Figma: one <font color> run per segment.
			local parts = {}
			for _, seg in t.rich do
				local text = seg.s:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")
				table.insert(parts, ('<font color="#%s">%s</font>'):format(rgb(seg.c):ToHex(), text))
			end
			label.RichText = true
			label.Text = table.concat(parts)
		end
		local st = t.stroke
		if st then
			local px = if st.align == "OUTSIDE" then st.w elseif st.align == "CENTER" then st.w / 2 else 0
			if px > 0 then
				local stroke = Instance.new("UIStroke")
				stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual
				stroke.LineJoinMode = Enum.LineJoinMode.Round
				stroke.Color = if shadow then rgb(shadow.c) else rgb(st.c)
				stroke.Transparency = 1 - (if shadow then shadow.a else st.a) * opacity
				stroke:SetAttribute("FF_StrokePx", px)
				stroke.Thickness = px
				stroke.Parent = label
			end
		end
		return label
	end

	local out = {}
	if t.shadow then
		table.insert(out, make(t.shadow.x, t.shadow.y, t.shadow))
	end
	table.insert(out, make(0, 0, nil))
	return out
end

local function lookupImage(n: any, opts: Options): string?
	local id = opts.images[n.image]
	if not id and n.alt then
		for _, alt in n.alt do
			id = opts.images[alt]
			if id then
				break
			end
		end
	end
	return id
end

-- `_ratio`: the layer keeps its Figma shape on any screen.
local function keepRatio(inst: GuiObject, n: any)
	if n.tags and n.tags.ratio and n.ph > 0 then
		local c = Instance.new("UIAspectRatioConstraint")
		c.AspectRatio = n.pw / n.ph
		c.Parent = inst
	end
end

local ALIGN_H = { MIN = Enum.HorizontalAlignment.Left, CENTER = Enum.HorizontalAlignment.Center, MAX = Enum.HorizontalAlignment.Right }
local ALIGN_V = { MIN = Enum.VerticalAlignment.Top, CENTER = Enum.VerticalAlignment.Center, MAX = Enum.VerticalAlignment.Bottom }

-- `_stack` / `_tiles`: Roblox lays the children out, so rows added by code line up.
-- Layouts place children by their top-left corner (AnchorPoint is ignored) and
-- resolve child Scale sizes and gaps against the box inside the padding, so every
-- child size is converted from "share of the frame" to "share of the content box".
local function applyLayout(holder: GuiObject, n: any, children: { GuiObject })
	local L = n.layout
	local pl, pt, pr, pb = L.pad[1], L.pad[2], L.pad[3], L.pad[4]
	local cw, ch = math.max(1, n.pw - pl - pr), math.max(1, n.ph - pt - pb)
	if pl + pt + pr + pb > 0 then
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft = UDim.new(pl / n.pw, 0)
		pad.PaddingRight = UDim.new(pr / n.pw, 0)
		pad.PaddingTop = UDim.new(pt / n.ph, 0)
		pad.PaddingBottom = UDim.new(pb / n.ph, 0)
		pad.Parent = holder
	end
	local kx, ky = n.pw / cw, n.ph / ch
	for i, c in children do
		c.LayoutOrder = i
		c.Size = UDim2.fromScale(c.Size.X.Scale * kx, c.Size.Y.Scale * ky)
		local base = c:GetAttribute("FF_BaseSize")
		if typeof(base) == "UDim2" then
			c:SetAttribute("FF_BaseSize", UDim2.fromScale(base.X.Scale * kx, base.Y.Scale * ky))
		end
	end
	local horizontal = L.dir == "HORIZONTAL"
	local mainH = if horizontal then L.main else L.cross
	local mainV = if horizontal then L.cross else L.main
	if n.tags.tiles and children[1] then
		local grid = Instance.new("UIGridLayout")
		grid.SortOrder = Enum.SortOrder.LayoutOrder
		grid.FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
		grid.CellSize = children[1].Size
		local gx = if horizontal then L.gap else L.gapCross
		local gy = if horizontal then L.gapCross else L.gap
		grid.CellPadding = UDim2.fromScale(gx / cw, gy / ch)
		grid.HorizontalAlignment = ALIGN_H[mainH] or Enum.HorizontalAlignment.Left
		grid.VerticalAlignment = ALIGN_V[mainV] or Enum.VerticalAlignment.Top
		grid.Parent = holder
	else
		local list = Instance.new("UIListLayout")
		list.SortOrder = Enum.SortOrder.LayoutOrder
		list.FillDirection = if horizontal then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
		list.Padding = UDim.new(L.gap / (if horizontal then cw else ch), 0)
		if L.wrap then
			list.Wraps = true
		end
		list.HorizontalAlignment = ALIGN_H[mainH] or Enum.HorizontalAlignment.Left
		list.VerticalAlignment = ALIGN_V[mainV] or Enum.VerticalAlignment.Top
		if L.main == "SPACE_BETWEEN" then
			pcall(function()
				if horizontal then
					list.HorizontalFlex = Enum.UIFlexAlignment.SpaceBetween
				else
					list.VerticalFlex = Enum.UIFlexAlignment.SpaceBetween
				end
			end)
		end
		list.Parent = holder
	end
end

local function buildNode(n: any, parent: any, z: number, opts: Options, warnings: { string }): { GuiObject }
	local opacity = n.opacity or 1

	if n.kind == "text" then
		return buildText(n, parent, z, warnings)
	end

	local inst: any
	if n.kind == "image" then
		inst = Instance.new(if n.button then "ImageButton" else "ImageLabel")
		place(inst, n, z)
		local id = lookupImage(n, opts)
		if id then
			inst.Image = id
		else
			table.insert(warnings, ("%s: no uploaded image for %s"):format(n.name, n.image))
		end
		inst.ImageTransparency = 1 - (n.imageAlpha or 1) * opacity
		if n.scale == "TILE" then
			local src = opts.imageSizes and opts.imageSizes[n.image]
			if src then
				local tw, th = src.X * n.tileScale, src.Y * n.tileScale
				inst.ScaleType = Enum.ScaleType.Tile
				inst.TileSize = UDim2.fromScale(tw / n.pw, th / n.ph)
			else
				table.insert(warnings, n.name .. ": tile size unknown, stretched instead")
			end
		elseif n.scale == "FIT" then
			inst.ScaleType = Enum.ScaleType.Fit
		elseif n.scale == "FILL" or n.scale == "CROP" then
			inst.ScaleType = Enum.ScaleType.Crop
		end
		if n.radius then
			corner(inst, n.radius, n.pw, n.ph)
		end
		if n.stroke then
			borderStroke(inst, n.stroke, n.pw, n.ph, opacity)
		end
		if n.button then
			inst.AutoButtonColor = false
		end
		keepRatio(inst, n)
		return { inst }
	end

	if n.kind == "canvas" then
		inst = Instance.new("CanvasGroup")
	elseif n.kind == "scroll" then
		-- canvasW/H are multiples of the frame, but the engine resolves CanvasSize Scale
		-- against the ScrollingFrame's PARENT. Converting here keeps the children's
		-- aspect; the raw value stretched every Boosts icon vertically (29 Sep).
		inst = Instance.new("ScrollingFrame")
		inst.CanvasSize = UDim2.fromScale((n.canvasW or 1) * n.w, (n.canvasH or 1) * n.h)
		inst.ScrollingDirection = if n.scrollDir == "HORIZONTAL"
			then Enum.ScrollingDirection.X
			elseif n.scrollDir == "BOTH" then Enum.ScrollingDirection.XY
			else Enum.ScrollingDirection.Y
		inst.ScrollBarThickness = 0
		inst.ElasticBehavior = Enum.ElasticBehavior.Always
		inst.Selectable = false
	elseif n.kind == "clip" then
		inst = Instance.new("Frame")
		inst.ClipsDescendants = true
	elseif n.button then
		inst = Instance.new("TextButton")
		inst.Text = ""
		inst.AutoButtonColor = false
		if n.tags and n.tags.group then
			table.insert(warnings, n.name .. ": _group is ignored on a button (a CanvasGroup cannot be clicked)")
		end
	elseif (n.tags and n.tags.group) or (opacity < 1 and n.children and #n.children > 0) then
		inst = Instance.new("CanvasGroup")
		inst.GroupTransparency = 1 - opacity
		opacity = 1
	else
		inst = Instance.new("Frame")
	end
	place(inst, n, z)
	fill(inst, n.fill, opacity)
	if n.radius then
		corner(inst, n.radius, n.pw, n.ph)
	end
	keepRatio(inst, n)
	-- Figma paints a frame's stroke above its children; Roblox paints it with the
	-- frame, under them. A full-size child (a buy button's Background) hid every
	-- inside stroke, so a frame with children gets the stroke on a top overlay.
	local strokeHost: Frame? = nil
	if n.stroke then
		if n.children and #n.children > 0 and n.stroke.align ~= "OUTSIDE" and n.kind ~= "canvas" and not n.layout then
			local host = Instance.new("Frame")
			host.Name = n.name .. "Stroke"
			host.AnchorPoint = Vector2.new(0.5, 0.5)
			host.Position = UDim2.fromScale(0.5, 0.5)
			host.Size = UDim2.fromScale(1, 1)
			host.BackgroundTransparency = 1
			host.BorderSizePixel = 0
			host.Active = false
			if n.radius then
				corner(host, n.radius, n.pw, n.ph)
			end
			borderStroke(host, n.stroke, n.pw, n.ph, opacity)
			strokeHost = host
		else
			borderStroke(inst, n.stroke, n.pw, n.ph, opacity)
		end
	end
	local childZ = 0
	local kids: { GuiObject } = {}
	if n.children then
		for _, child in n.children do
			for _, built in buildNode(child, n, childZ + 1, opts, warnings) do
				childZ += 1
				built.ZIndex = childZ
				built.Parent = inst
				table.insert(kids, built)
			end
		end
	end
	if n.layout then
		-- A clipping frame keeps its children one level down, in <name>Clip.
		local holder: GuiObject = inst
		if #kids == 1 and kids[1]:GetAttribute("FF_Id") == n.id .. ":clip" then
			holder = kids[1]
			kids = {}
			for _, c in holder:GetChildren() do
				if c:IsA("GuiObject") then
					table.insert(kids, c)
				end
			end
			table.sort(kids, function(a, b)
				return a.ZIndex < b.ZIndex
			end)
		end
		applyLayout(holder, n, kids)
	end
	if strokeHost then
		strokeHost.ZIndex = childZ + 1
		strokeHost.Parent = inst
	end
	return { inst }
end

function Builder.build(ir: any, opts: Options): (ScreenGui, { string })
	local warnings = table.clone(ir.warnings or {})
	local gui = Instance.new("ScreenGui")
	gui.Name = opts.name or ("Figlo_" .. ir.root.name)
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.IgnoreGuiInset = true
	gui.ResetOnSpawn = false
	gui:SetAttribute("FF_DesignW", ir.design.w)
	gui:SetAttribute("FF_DesignH", ir.design.h)
	gui:SetAttribute("FF_Root", ir.root.name)
	gui:SetAttribute("FF_Source", (ir.source.file or "?") .. "/" .. ir.source.node)

	-- The extractor flags `button` on tagged children only; a frame that is itself
	-- a `_smooth`/`_button` (CloseButton_smooth, 30 Sep) came out a plain Frame.
	if ir.root.tags and ir.root.tags.button then
		ir.root.button = true
	end
	local root = buildNode(ir.root, { pw = ir.design.w, ph = ir.design.h }, 1, opts, warnings)[1]
	local aspect = Instance.new("UIAspectRatioConstraint")
	aspect.AspectRatio = ir.design.w / ir.design.h
	aspect.Parent = root
	root.Parent = gui

	if opts.runtime then
		local rt = opts.runtime:Clone()
		rt.Name = "FigloRuntime"
		rt.Parent = gui
	end
	if opts.client then
		local cl = opts.client:Clone()
		cl.Name = "FigloClient"
		cl.Parent = gui
	end
	gui.Parent = opts.parent
	return gui, warnings
end

return Builder
