extends GameScreen

## Drag anywhere to slide the player left and right.
## Blocks fall faster the longer you survive. One hit ends the run.

const PLAYER_SIZE := Vector2(96, 96)
const BLOCK_SIZE := Vector2(110, 110)
const BOTTOM_MARGIN := 220.0
const SPAWN_START := 0.75
const SPAWN_MIN := 0.28
const FALL_START := 420.0
const FALL_MAX := 1150.0

var _player: ColorRect
var _blocks: Array[ColorRect] = []
var _running := false
var _elapsed := 0.0
var _spawn_timer := 0.0
var _score_accum := 0.0

func _ready() -> void:
	setup_hud("Dodger")
	_player = ColorRect.new()
	_player.color = Palette.ACCENT
	_player.size = PLAYER_SIZE
	add_child(_player)
	start_round()

func start_round() -> void:
	for b in _blocks:
		b.queue_free()
	_blocks.clear()
	_elapsed = 0.0
	_spawn_timer = 0.0
	_score_accum = 0.0
	_player.position = Vector2(_play_size().x * 0.5 - PLAYER_SIZE.x * 0.5, _player_y())
	_running = true

func _play_size() -> Vector2:
	return get_viewport_rect().size

func _player_y() -> float:
	return _play_size().y - BOTTOM_MARGIN

func difficulty() -> float:
	# Ramps 0 -> 1 over the first 45 seconds of a run.
	return clampf(_elapsed / 45.0, 0.0, 1.0)

func _input(event: InputEvent) -> void:
	if not _running:
		return
	var pos := Vector2.ZERO
	if event is InputEventScreenDrag:
		pos = (event as InputEventScreenDrag).position
	elif event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed:
		pos = (event as InputEventScreenTouch).position
	else:
		return
	_move_player_to(pos.x)

func _move_player_to(x: float) -> void:
	var half := PLAYER_SIZE.x * 0.5
	_player.position.x = clampf(x - half, 0.0, _play_size().x - PLAYER_SIZE.x)
	_player.position.y = _player_y()

func _process(delta: float) -> void:
	if not _running:
		return
	_elapsed += delta

	# Keyboard fallback so the game is playable on desktop while testing.
	var axis := Input.get_axis("ui_left", "ui_right")
	if not is_zero_approx(axis):
		_move_player_to(_player.position.x + PLAYER_SIZE.x * 0.5 + axis * 900.0 * delta)

	_score_accum += delta * 10.0
	if _score_accum >= 1.0:
		add_score(int(_score_accum))
		_score_accum = fmod(_score_accum, 1.0)

	_spawn_timer -= delta
	if _spawn_timer <= 0.0:
		_spawn_timer = lerpf(SPAWN_START, SPAWN_MIN, difficulty())
		_spawn_block()

	_update_blocks(delta)

func _spawn_block() -> void:
	var block := ColorRect.new()
	block.color = Palette.DANGER
	block.size = BLOCK_SIZE
	block.position = Vector2(randf_range(0.0, _play_size().x - BLOCK_SIZE.x), -BLOCK_SIZE.y)
	add_child(block)
	_blocks.append(block)

func _update_blocks(delta: float) -> void:
	var speed := lerpf(FALL_START, FALL_MAX, difficulty())
	var player_rect := Rect2(_player.position, PLAYER_SIZE)
	var height := _play_size().y
	var survivors: Array[ColorRect] = []
	for block in _blocks:
		block.position.y += speed * delta
		if Rect2(block.position, BLOCK_SIZE).intersects(player_rect):
			_running = false
			game_over("Hit!")
			return
		if block.position.y > height:
			block.queue_free()
		else:
			survivors.append(block)
	_blocks = survivors
