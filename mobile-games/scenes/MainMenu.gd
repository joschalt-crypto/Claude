extends Control

## Lists every game from Games.LIST and launches the one you tap.

func _ready() -> void:
	_build()

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 18)
	root.offset_left = 40
	root.offset_right = -40
	root.offset_top = 90
	root.offset_bottom = -60
	add_child(root)

	root.add_child(Palette.label("Mini Games", 64))
	root.add_child(Palette.label("one hand, one minute", 26, Palette.MUTED))

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 30)
	root.add_child(spacer)

	for game in Games.LIST:
		root.add_child(_make_card(game))

func _make_card(game: Dictionary) -> Button:
	var best: int = Scores.best(game["title"])
	var card := Button.new()
	card.custom_minimum_size = Vector2(0, 150)
	card.focus_mode = Control.FOCUS_NONE
	card.pressed.connect(_on_play.bind(game["scene"]))

	var style := StyleBoxFlat.new()
	style.bg_color = Palette.PANEL
	style.set_corner_radius_all(20)
	style.border_width_left = 8
	style.border_color = game["color"]
	card.add_theme_stylebox_override("normal", style)
	var pressed_style: StyleBoxFlat = style.duplicate()
	pressed_style.bg_color = Palette.PANEL.lightened(0.12)
	card.add_theme_stylebox_override("pressed", pressed_style)
	card.add_theme_stylebox_override("hover", style)

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_FULL_RECT)
	box.offset_left = 28
	box.offset_right = -20
	box.offset_top = 22
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(box)

	var title := Palette.label(game["title"], 40)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(title)

	var blurb := Palette.label(game["blurb"], 24, Palette.MUTED)
	blurb.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	box.add_child(blurb)

	if best > 0:
		var rec := Palette.label("best %d" % best, 22, game["color"])
		rec.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		box.add_child(rec)

	return card

func _on_play(scene_path: String) -> void:
	get_tree().change_scene_to_file(scene_path)
