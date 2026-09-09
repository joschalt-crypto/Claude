extends RefCounted
class_name Games

## Central registry of every mini game.
## Add a new entry here and it shows up on the main menu automatically.
const LIST: Array[Dictionary] = [
	{
		"title": "Dodger",
		"blurb": "Drag to move. Avoid the falling blocks.",
		"scene": "res://games/dodger/Dodger.tscn",
		"color": Color("#e5484d"),
	},
	{
		"title": "Color Tap",
		"blurb": "Tap the tile that matches the word.",
		"scene": "res://games/colortap/ColorTap.tscn",
		"color": Color("#3e63dd"),
	},
]
