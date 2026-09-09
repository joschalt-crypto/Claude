# Mini Games

A small Godot 4.3 project for one-hand portrait games — the kind you can build
in an idle half hour and play on a phone.

## Run it

```bash
tools/get_godot.sh          # downloads Godot into .godot-bin/ (git-ignored)
.godot-bin/godot --path mobile-games            # play on desktop
.godot-bin/godot --path mobile-games --editor   # open the editor
```

Mouse input is treated as touch, so everything is playable on desktop.

## Check it without a phone

```bash
tools/test.sh         # every script compiles, every scene runs 30 frames
tools/screenshot.sh   # renders each scene to shots/*.png
```

`tools/test.sh` exits non-zero on failure, so it works as a pre-commit check.
It validates scripts before scenes on purpose: Godot silently drops a script
that fails to compile and instantiates the scene anyway, so a scene-only check
would report a false pass.

## Adding a game

1. Make `games/<name>/<Name>.gd` extending `GameScreen`.
2. In `_ready()`, call `setup_hud("<Title>")`, build your nodes, then
   `start_round()`.
3. Call `add_score()` when the player scores, `game_over("...")` when they lose.
   The base class handles the score readout, the back button, the game-over card
   and the personal best.
4. Add a matching `<Name>.tscn` with a single `Control` root carrying the script.
5. Add an entry to `LIST` in `scripts/Games.gd` — the menu and both tools pick
   it up automatically.

## Layout

| Path | What it is |
| --- | --- |
| `scenes/MainMenu.gd` | Menu, generated from the game registry |
| `scripts/Games.gd` | The registry: title, blurb, scene path, colour |
| `scripts/GameScreen.gd` | Base class: HUD, game-over card, restart |
| `scripts/Palette.gd` | Colours and label helper |
| `scripts/Scores.gd` | Best score per game in `user://scores.cfg` |
| `tests/smoke.gd` | The checks run by `tools/test.sh` |
| `tests/screenshot.gd` | The renderer used by `tools/screenshot.sh` |

## Playing it on a phone

The project is exported to the web and committed to `docs/`, which GitHub Pages
serves. Rebuild after any change:

```bash
tools/build_web.sh    # exports into docs/ (fetches export templates once)
git add docs && git commit -m "Rebuild web build" && git push
```

The build uses Godot's **nothreads** web template on purpose. The threaded one
needs `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response
headers, and GitHub Pages cannot set those, so the threaded build would fail to
start.

`docs/.nojekyll` matters too: without it Pages runs Jekyll, which drops files
whose names start with an underscore or dot.

## Shipping to Android

Not set up. It needs the Android SDK and a Java toolchain, neither of which is
installed here. The export templates are already handled by `tools/build_web.sh`.
Once the SDK is in place: add an Android preset in the editor, then
`godot --headless --path mobile-games --export-release Android game.apk`.
