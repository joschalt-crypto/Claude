extends RefCounted
class_name Palette

## One place for colours so every game looks like part of the same app.
const BG := Color("#101014")
const PANEL := Color("#1c1c22")
const TEXT := Color("#f2f2f5")
const MUTED := Color("#8b8b96")
const ACCENT := Color("#3e63dd")
const DANGER := Color("#e5484d")
const GOOD := Color("#30a46c")

static func label(text: String, size: int, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l
