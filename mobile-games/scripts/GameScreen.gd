extends Control
class_name GameScreen

## Shared shell for every mini game: background, score readout, back button
## and a game-over card. Subclasses call setup_hud() then implement
## start_round() and handle their own input.

signal round_started

var game_name := "Game"
var score := 0

var _score_label: Label
var _overlay: Control

func setup_hud(title: String) -> void:
	game_name = title
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var bg := ColorRect.new()
	bg.color = Palette.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)

	_score_label = Palette.label("0", 56)
	_score_label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_score_label.offset_top = 50
	_score_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_score_label)

	var back := Button.new()
	back.text = "<"
	back.flat = true
	back.focus_mode = Control.FOCUS_NONE
	back.add_theme_font_size_override("font_size", 44)
	back.add_theme_color_override("font_color", Palette.MUTED)
	back.position = Vector2(20, 44)
	back.custom_minimum_size = Vector2(90, 90)
	back.pressed.connect(quit_to_menu)
	add_child(back)

func set_score(value: int) -> void:
	score = value
	if _score_label:
		_score_label.text = str(value)

func add_score(delta: int = 1) -> void:
	set_score(score + delta)

func quit_to_menu() -> void:
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")

## Show the end-of-round card. Subclasses call this when the player loses.
func game_over(headline: String = "Game over") -> void:
	var is_record: bool = Scores.submit(game_name, score)

	_overlay = Control.new()
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_overlay)

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.72)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay.add_child(dim)

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.add_theme_constant_override("separation", 16)
	box.custom_minimum_size = Vector2(520, 0)
	box.position = Vector2(-260, -180)
	box.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_overlay.add_child(box)

	box.add_child(Palette.label(headline, 52))
	box.add_child(Palette.label(str(score), 110, Palette.ACCENT))
	if is_record:
		box.add_child(Palette.label("new best!", 30, Palette.GOOD))
	else:
		box.add_child(Palette.label("best %d" % Scores.best(game_name), 28, Palette.MUTED))

	box.add_child(_menu_button("Play again", Palette.ACCENT, restart))
	box.add_child(_menu_button("Menu", Palette.PANEL, quit_to_menu))

func _menu_button(text: String, color: Color, action: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 100)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 34)
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(18)
	b.add_theme_stylebox_override("normal", style)
	b.add_theme_stylebox_override("hover", style)
	var pressed_style: StyleBoxFlat = style.duplicate()
	pressed_style.bg_color = color.lightened(0.15)
	b.add_theme_stylebox_override("pressed", pressed_style)
	b.pressed.connect(action)
	return b

func restart() -> void:
	if _overlay:
		_overlay.queue_free()
		_overlay = null
	set_score(0)
	start_round()
	round_started.emit()

## Override in each game.
func start_round() -> void:
	pass
