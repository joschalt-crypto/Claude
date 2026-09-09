extends RefCounted
class_name Scores

## Best score per game, persisted in user://scores.cfg.
## Static so it works in the editor, in game, and in headless test runs
## without depending on an autoload being present.

const PATH := "user://scores.cfg"

static var _cfg: ConfigFile = null

static func _config() -> ConfigFile:
	if _cfg == null:
		_cfg = ConfigFile.new()
		_cfg.load(PATH)
	return _cfg

static func best(game: String) -> int:
	return int(_config().get_value("best", game, 0))

## Returns true when the submitted score beats the stored record.
static func submit(game: String, score: int) -> bool:
	if score <= best(game):
		return false
	var cfg := _config()
	cfg.set_value("best", game, score)
	cfg.save(PATH)
	return true
