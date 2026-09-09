extends GameScreen

## A Stroop-style reaction game: a colour word appears in a misleading ink
## colour. Tap the tile matching the WORD, not the ink. Miss or run out of
## time and the round ends.

const NAMES := ["RED", "BLUE", "GREEN", "YELLOW"]
const COLORS := {
	"RED": Color("#e5484d"),
	"BLUE": Color("#3e63dd"),
	"GREEN": Color("#30a46c"),
	"YELLOW": Color("#f5d90a"),
}
const TIME_START := 2.4
const TIME_MIN := 0.85
const RAMP_HITS := 25.0

var _prompt: Label
var _bar: ColorRect
var _tiles: Array[Button] = []
var _answer := ""
var _time_left := 0.0
var _limit := TIME_START
var _running := false

func _ready() -> void:
	setup_hud("Color Tap")
	_build_board()
	start_round()

func _build_board() -> void:
	_prompt = Palette.label("", 96)
	_prompt.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_prompt.offset_top = 250
	_prompt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_prompt)

	_bar = ColorRect.new()
	_bar.color = Palette.MUTED
	_bar.position = Vector2(60, 430)
	_bar.size = Vector2(600, 14)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bar)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 24)
	grid.add_theme_constant_override("v_separation", 24)
	grid.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	grid.offset_left = 50
	grid.offset_right = -50
	grid.offset_top = -680
	grid.offset_bottom = -70
	add_child(grid)

	for color_name in NAMES:
		var tile := Button.new()
		tile.custom_minimum_size = Vector2(290, 290)
		tile.focus_mode = Control.FOCUS_NONE
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.size_flags_vertical = Control.SIZE_EXPAND_FILL
		var style := StyleBoxFlat.new()
		style.bg_color = COLORS[color_name]
		style.set_corner_radius_all(28)
		tile.add_theme_stylebox_override("normal", style)
		tile.add_theme_stylebox_override("hover", style)
		var pressed_style: StyleBoxFlat = style.duplicate()
		pressed_style.bg_color = COLORS[color_name].lightened(0.25)
		tile.add_theme_stylebox_override("pressed", pressed_style)
		tile.pressed.connect(_on_tile.bind(color_name))
		grid.add_child(tile)
		_tiles.append(tile)

func start_round() -> void:
	_limit = TIME_START
	_running = true
	_next_prompt()

func _next_prompt() -> void:
	_answer = NAMES[randi() % NAMES.size()]
	# Ink colour is deliberately a different colour than the word.
	var ink := _answer
	while ink == _answer:
		ink = NAMES[randi() % NAMES.size()]
	_prompt.text = _answer
	_prompt.add_theme_color_override("font_color", COLORS[ink])
	_limit = lerpf(TIME_START, TIME_MIN, clampf(score / RAMP_HITS, 0.0, 1.0))
	_time_left = _limit

func _on_tile(color_name: String) -> void:
	if not _running:
		return
	if color_name == _answer:
		add_score()
		_next_prompt()
	else:
		_running = false
		game_over("Wrong colour")

func _process(delta: float) -> void:
	if not _running:
		return
	_time_left -= delta
	_bar.size.x = 600.0 * clampf(_time_left / _limit, 0.0, 1.0)
	_bar.color = Palette.GOOD if _time_left > _limit * 0.35 else Palette.DANGER
	if _time_left <= 0.0:
		_running = false
		game_over("Too slow")
