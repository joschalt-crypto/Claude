extends SceneTree

## Headless checks, run with tools/test.sh:
##   1. every .gd file in the project compiles
##   2. every registered scene instantiates, keeps its script, and survives
##      a burst of _process() frames
##
## Note: a scene whose script fails to compile still instantiates fine (Godot
## just drops the script), so step 1 is what actually catches broken code.

const FRAMES := 30
const SKIP_DIRS := ["res://.godot", "res://addons"]

var _failures := 0

func _init() -> void:
	await process_frame

	print("-- scripts --")
	for path in _all_scripts("res://"):
		_report(path, _check_script(path))

	# Godot can segfault while instantiating a scene whose script is broken,
	# so stop here and let the script errors above be the report.
	if _failures > 0:
		print("\nSkipping scene checks: %d script(s) do not compile." % _failures)
		quit(1)
		return

	print("\n-- scenes --")
	var scenes: Array[String] = ["res://scenes/MainMenu.tscn"]
	for game in Games.LIST:
		scenes.append(game["scene"])
	for path in scenes:
		_report(path, await _check_scene(path))

	if _failures == 0:
		print("\nAll checks passed.")
	else:
		print("\n%d check(s) failed." % _failures)
	quit(1 if _failures > 0 else 0)

func _report(path: String, problem: String) -> void:
	if problem.is_empty():
		print("ok    ", path)
	else:
		print("FAIL  ", path, "  -> ", problem)
		_failures += 1

func _all_scripts(dir_path: String) -> Array[String]:
	var found: Array[String] = []
	for skip in SKIP_DIRS:
		if dir_path.begins_with(skip):
			return found
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return found
	dir.list_dir_begin()
	var entry := dir.get_next()
	while entry != "":
		if entry.begins_with("."):
			entry = dir.get_next()
			continue
		var full := dir_path.path_join(entry)
		if dir.current_is_dir():
			found.append_array(_all_scripts(full))
		elif entry.ends_with(".gd"):
			found.append(full)
		entry = dir.get_next()
	dir.list_dir_end()
	found.sort()
	return found

func _check_script(path: String) -> String:
	# A parse error makes ResourceLoader hand back nothing at all.
	var script := load(path) as GDScript
	if script == null:
		return "does not compile"
	if not script.can_instantiate():
		return "compiled but cannot be instantiated"
	return ""

func _check_scene(path: String) -> String:
	if not ResourceLoader.exists(path):
		return "file missing"
	var packed := load(path) as PackedScene
	if packed == null:
		return "not a PackedScene"

	var node := packed.instantiate()
	if node == null:
		return "instantiate() returned null"
	var script := node.get_script() as Script
	if script == null or not script.can_instantiate():
		node.free()
		return "script missing or broken"

	root.add_child(node)
	for i in FRAMES:
		await process_frame
	if not is_instance_valid(node):
		return "node freed itself during play"
	node.queue_free()
	await process_frame
	return ""
