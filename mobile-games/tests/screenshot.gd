extends SceneTree

## Renders every scene to a PNG so layout can be checked without a phone.
## Run with: tools/screenshot.sh [output_dir]

const FRAMES := 90

func _init() -> void:
	await process_frame
	var out_dir: String = "res://../shots"
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))

	var targets: Dictionary = {"menu": "res://scenes/MainMenu.tscn"}
	for game in Games.LIST:
		targets[String(game["title"]).to_lower().replace(" ", "-")] = game["scene"]

	for key in targets:
		var node := (load(targets[key]) as PackedScene).instantiate()
		root.add_child(node)
		for i in FRAMES:
			await process_frame
		await RenderingServer.frame_post_draw
		var path: String = out_dir.path_join("%s.png" % key)
		root.get_texture().get_image().save_png(path)
		print("saved ", ProjectSettings.globalize_path(path))
		node.free()
		await process_frame
	quit()
