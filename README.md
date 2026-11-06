# pixelpaper

A wallpaper for [Quickshell](https://quickshell.org) on Hyprland. It draws 1-bit desktop scenes (file lists, a type specimen, an icon window, a keypad, a preferences panel, a dialog) on a tilted plane, drifts them slowly, and stops when other programs need the CPU. The text in each scene comes from your machine: hostname, the playing song (MPRIS), uptime, memory use, battery and Hyprland workspace names.

Live demo and download: **https://talon270.github.io/pixelpaper/**. The demo runs the real scene generator from this repo with sample text.

## Install

You need Quickshell, Hyprland, and a kernel with PSI (Linux 4.20 or later; `/proc/pressure/cpu` must exist). Tested with Quickshell 0.3.1 on CachyOS.

```sh
mkdir -p ~/.config/quickshell
curl -L https://github.com/talon270/pixelpaper/releases/latest/download/pixelpaper.tar.gz \
  | tar -xz -C ~/.config/quickshell
qs -c pixelpaper -d
```

Stop your old wallpaper daemon (hyprpaper, swww, swaybg) first: it draws on the same background layer. To start pixelpaper with Hyprland, add to `hyprland.conf`:

```
exec-once = qs -c pixelpaper -d
bind = SUPER ALT, S, exec, qs -c pixelpaper ipc call scene next
bind = SUPER ALT, W, exec, qs -c pixelpaper ipc call palette next
```

From a clone, `ln -s "$PWD/pixelpaper" ~/.config/quickshell/pixelpaper` does the same as the tarball. Edits to `.js` files need a restart: `qs kill -c pixelpaper; qs -c pixelpaper -d`.

## Commands

Every command is `qs -c pixelpaper ipc call <target> <function> [argument]`. Palette and appearance are saved in `~/.local/state/` and survive a restart.

| Target | Function | What it does |
|---|---|---|
| `scene` | `next` | Build a new scene now, with fresh live text |
| `scene` | `kind <name>` | Build one kind: `list specimen icons keypad controls field dialog` |
| `scene` | `list` | Print the kinds |
| `scene` | `snap <path.png>` | Save the first screen's wallpaper as a PNG |
| `palette` | `next`, `prev` | Step through 9 colours, then `spectrum` (hue turns once an hour) and `random` (new colour each scene) |
| `palette` | `set <name\|#rrggbb>` | Pick a palette by name, or any hex colour |
| `palette` | `list`, `get` | Print the names, or the current one |
| `appearance` | `set <dark\|light\|auto>` | `auto` follows `~/.local/state/caelestia/scheme.json` if you use the caelestia shell |
| `appearance` | `get` | Print the current appearance |

Knobs (scene length, zoom, drift radius and speed, ink strength, frame rate) sit at the top of `pixelpaper/Scene.qml`. The pressure thresholds are `busyAbove` and `calmBelow` in `pixelpaper/Stats.qml`.

## The things most animated wallpapers get wrong

**It stops when other programs wait for the CPU, measured by pressure, not usage.** `Stats.qml` reads `some avg10` from `/proc/pressure/cpu`: the share of the last 10 s in which a ready task waited for a core. Above 25% the drift springs to a stop; below 10% it starts again, so it does not flap at the edge. An idle machine reads about 3%. CPU usage would be the wrong signal: a job that fills one core while the others sit free makes nothing wait, and stopping for it buys nothing. In testing, a full load stopped the drift within about 5 s.

**Each scene is painted once, then moved.** A new scene is painted into one canvas, which costs about 0.8 s of CPU once every ~4 minutes. Drift moves that canvas as one item, so a frame is a transform, not a repaint. On one screen at 20 fps, CPU use fell from 10.2% to 3.1% of one core after this change, and to 0.2% while paused. The soft shadow is two offset passes, not `shadowBlur`: blur cost about 3.3 s of CPU per scene.

**It stops when no one can see it.** A fullscreen window on that monitor, or 5 minutes without input, pauses the drift and the scene timer. Idle respects inhibitors, so a windowed video keeps it drifting. These two pauses are wired up but not yet measured.

**It wanders instead of scrolling.** The camera follows two slow sines per axis at unrelated rates, so it curves through every direction and stays within 12% of the screen height of the centre. Speed is a critically damped spring: a stop eases out over about 2 s and never overshoots.

**Colour changes never repaint.** Ink is painted black and the canvas is drawn at 20% opacity (17% in light mode) over the base colour. Palette, spectrum and light/dark changes only move the base, on per-channel springs.

**Live text is read once per scene.** Values are taken when a scene is built and stay until the next one, up to ~5 minutes later. `scene next` gives a fresh reading. Only some kinds show memory: `controls` always, `icons` always, `keypad` and `dialog` sometimes.

## What is measured, what is not

| Measured | Not measured yet |
|---|---|
| 3.1% of one core drifting, 0.2% paused (one screen, 20 fps) | Fullscreen and idle pauses |
| Pressure pause trips within ~5 s of full load | Several monitors (each gets its own scene; tested on one) |
| `node pixelpaper/check-scenes.js`: 7 kinds, 2 sizes, 20 seeds each, ink between 2% and 70% | Compositors other than Hyprland |
| `node pixelpaper/check-icons.js`: every icon kind is picked and non-empty | Quickshell versions other than 0.3.1 |

Quickshell warns when it was built against an older Qt than the one installed. Rebuild Quickshell if it does: the mismatch can crash it.

## Files

| File | Job |
|---|---|
| `pixelpaper/shell.qml` | Palettes, appearance, IPC, one window per screen, pause conditions |
| `pixelpaper/Scene.qml` | Picks and builds scenes, wander, colour springs |
| `pixelpaper/SceneLayer.qml` | Paints one scene into a canvas and fades it in |
| `pixelpaper/Stats.qml` | CPU pressure, memory, uptime, MPRIS, workspaces |
| `pixelpaper/scenes.js` | Scene generator and the 5x7 font |
| `pixelpaper/icons.js` | 16x16 icons and keycaps |
| `index.html` | The GitHub Pages demo; it loads the two `.js` files above |

## Privacy

Nothing leaves your machine. The scenes print your hostname, song and workspace names on your own screen; keep that in mind before you share a screenshot or a `scene snap`.

Inspired by the "Macintosh" wallpaper in macOS Tahoe. Contains no Apple artwork, fonts or text, and is not affiliated with Apple. MIT licence.
