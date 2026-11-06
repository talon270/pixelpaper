import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland

ShellRoot {
    id: root

    // Colours of the macOS "Macintosh" wallpaper set, plus a few extras.
    // l = dark-mode base lightness at midday; light mode derives its own from it.
    readonly property var palettes: [
        { name: "red",      h: 0.000, s: 0.58, l: 0.40 },
        { name: "orange",   h: 0.065, s: 0.75, l: 0.47 },
        { name: "yellow",   h: 0.125, s: 0.80, l: 0.52 },
        { name: "green",    h: 0.360, s: 0.40, l: 0.36 },
        { name: "teal",     h: 0.480, s: 0.50, l: 0.36 },
        { name: "blue",     h: 0.600, s: 0.55, l: 0.42 },
        { name: "purple",   h: 0.760, s: 0.40, l: 0.42 },
        { name: "pink",     h: 0.920, s: 0.55, l: 0.50 },
        { name: "graphite", h: 0.600, s: 0.06, l: 0.32 }
    ]
    // Modes cycle after the fixed colours. spectrum: hue turns once per hour.
    // random: a new palette with every scene.
    readonly property var modes: [{ name: "spectrum" }, { name: "random" }]
    readonly property var cycle: palettes.concat(modes)
    property var current: palettes[0]
    property var randomPick: palettes[Math.floor(Math.random() * palettes.length)]
    property real spectrumHue: 0

    readonly property var colour: current.name === "spectrum" ? { h: spectrumHue, s: 0.55, l: 0.42 }
                                : current.name === "random" ? randomPick : current

    Timer {   // spectrum: small steps, smoothed by the colour springs in Scene.qml
        running: root.current.name === "spectrum"
        repeat: true
        triggeredOnStart: true
        interval: 5000
        onTriggered: root.spectrumHue = (Date.now() / 3600000) % 1
    }
    function reroll() {
        const others = palettes.filter(p => p.name !== randomPick.name);
        randomPick = others[Math.floor(Math.random() * others.length)];
    }

    // "#rrggbb" makes a custom palette from that colour; otherwise look up by name.
    function find(name) {
        const n = String(name).trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(n)) {
            const c = Qt.color(n);
            return { name: n, h: Math.max(0, c.hslHue), s: c.hslSaturation, l: c.hslLightness };
        }
        return cycle.find(p => p.name === n) || null;
    }

    function apply(p) {
        current = p;
        stateFile.setText(p.name + "\n");
    }

    function step(d) {
        const i = cycle.findIndex(p => p.name === current.name);   // -1 for a custom colour
        const n = cycle.length;
        apply(cycle[i < 0 ? 0 : (i + d + n) % n]);
    }

    // Remembers the last palette across restarts.
    FileView {
        id: stateFile
        path: Quickshell.env("HOME") + "/.local/state/pixelpaper-palette"
        blockLoading: true
        printErrors: false
        onLoaded: {
            const p = root.find(text());
            if (p) root.current = p;
        }
    }

    // qs -c pixelpaper ipc call palette next | prev | list | get | set <name, mode or #rrggbb>
    IpcHandler {
        target: "palette"
        function next(): void { root.step(1); }
        function prev(): void { root.step(-1); }
        function list(): string { return root.cycle.map(p => p.name).join(" "); }
        function get(): string { return root.current.name; }
        function set(name: string): string {
            const p = root.find(name);
            if (!p) return "unknown palette: " + name + " (try: " + list() + ", or #rrggbb)";
            root.apply(p);
            return p.name;
        }
    }

    // ---- appearance: dark | light | auto (follows the caelestia scheme mode) ----
    property string appearance: "dark"
    property string shellMode: "dark"
    readonly property bool light: appearance === "light" || (appearance === "auto" && shellMode === "light")

    FileView {
        id: appearanceFile
        path: Quickshell.env("HOME") + "/.local/state/pixelpaper-appearance"
        blockLoading: true
        printErrors: false
        onLoaded: {
            const a = text().trim();
            if (["dark", "light", "auto"].indexOf(a) >= 0) root.appearance = a;
        }
    }
    FileView {
        path: Quickshell.env("HOME") + "/.local/state/caelestia/scheme.json"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: {
            try { root.shellMode = JSON.parse(text()).mode === "light" ? "light" : "dark"; } catch (e) {}
        }
    }

    // qs -c pixelpaper ipc call appearance get | set <dark|light|auto>
    IpcHandler {
        target: "appearance"
        function get(): string { return root.appearance + (root.appearance === "auto" ? " (" + root.shellMode + ")" : ""); }
        function set(mode: string): string {
            const m = String(mode).trim().toLowerCase();
            if (["dark", "light", "auto"].indexOf(m) < 0) return "unknown appearance: " + mode + " (try: dark light auto)";
            root.appearance = m;
            appearanceFile.setText(m + "\n");
            return get();
        }
    }

    // ---- scenes ----
    property var scenes: []

    // qs -c pixelpaper ipc call scene next | list | kind <name> | snap <path.png>
    IpcHandler {
        target: "scene"
        function next(): void { root.scenes.forEach(s => s.next()); }
        function list(): string { return "list specimen icons keypad controls field dialog"; }
        function kind(name: string): void { root.scenes.forEach(s => s.next(name)); }
        function snap(path: string): string {   // render the first screen's wallpaper to a PNG
            if (!root.scenes.length) return "no screens";
            root.scenes[0].grabToImage(r => r.saveToFile(path));
            return path;
        }
    }

    Stats { id: liveStats }

    // No one is looking after 5 min without input. Video players inhibit idle, so it keeps
    // drifting under a windowed video; a fullscreen one is caught per screen below.
    IdleMonitor { id: idle; timeout: 300; respectInhibitors: true }

    Variants {
        model: Quickshell.screens

        PanelWindow {
            required property var modelData
            screen: modelData

            WlrLayershell.layer: WlrLayer.Background
            WlrLayershell.namespace: "pixelpaper"
            exclusionMode: ExclusionMode.Ignore
            anchors { top: true; bottom: true; left: true; right: true }
            color: "black"

            Scene {
                id: sceneItem
                anchors.fill: parent
                stats: liveStats
                paused: liveStats.busy || idle.isIdle
                        || (Hyprland.monitorFor(modelData)?.activeWorkspace?.hasFullscreen ?? false)
                light: root.light
                hue: root.colour.h
                saturation: root.colour.s
                lightness: root.colour.l
                onSceneShown: if (root.current.name === "random") root.reroll()
                Component.onCompleted: root.scenes = root.scenes.concat([sceneItem])
                Component.onDestruction: root.scenes = root.scenes.filter(s => s !== sceneItem)
            }
        }
    }
}
