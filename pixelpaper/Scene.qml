import QtQuick
import "scenes.js" as Scenes

Item {
    id: scene

    required property var stats
    property bool paused: false       // set by shell.qml: CPU pressure, idle, or a fullscreen window
    property bool light: false        // light appearance (shell.qml resolves auto)

    signal sceneShown()               // a new scene finished fading in (shell.qml: random palette)

    // ---- tweak these ---------------------------------------------------
    // Colour comes from the palette in shell.qml; switch with `qs -c pixelpaper ipc call palette next`.
    property real hue: 0.0
    property real saturation: 0.58
    property real lightness: 0.40     // dark-mode base lightness at midday
    property real inkDark: 0.2        // ink strength on a dark base (black at this opacity)
    property real inkLight: 0.17      // ink strength on a light base
    property real sceneSeconds: 240   // a new scene roughly this often (±25%)
    property real zoomMin: 8          // cell size range in px at 1080p; each scene picks one
    property real zoomMax: 15
    property real panRadius: 0.12     // wander stays within this fraction of screen height
    property real panSpeed: 0.04      // rad/s along the wander curve; ~5 px/s at 1080p
    property real speedStiffness: 2   // speed spring; higher = stops and starts faster
    property int fps: 20              // drift is ~5 px/s, so 20 fps moves 0.25 px per frame
    // --------------------------------------------------------------------

    // Time of day: dimmer at night, brightest around midday (dark mode only).
    readonly property real clockHours: stats.hour + stats.minute / 60
    readonly property real daylight: Math.max(0, Math.sin(Math.PI * (clockHours - 6) / 12))
    readonly property real dim: 0.675 + 0.325 * daylight
    readonly property real baseL: light ? Math.min(0.88, 0.62 + 0.4 * lightness) : lightness * dim
    readonly property real baseS: light ? saturation * 0.8 : saturation
    SpringColor { id: baseColor; target: Qt.hsla(scene.hue, scene.baseS, scene.baseL, 1) }
    readonly property color base: baseColor.value
    property real ink: light ? inkLight : inkDark
    Behavior on ink { SpringAnimation { spring: 3; damping: 0.6; epsilon: 0.002 } }

    // Each RGB channel follows its target on a spring, so a palette switch mid-transition
    // retargets from the current colour and velocity instead of jumping.
    component SpringColor: Item {
        property color target
        property real r: target.r
        property real g: target.g
        property real b: target.b
        readonly property color value: Qt.rgba(r, g, b, 1)
        Behavior on r { SpringAnimation { spring: 3; damping: 0.45; epsilon: 0.002 } }
        Behavior on g { SpringAnimation { spring: 3; damping: 0.45; epsilon: 0.002 } }
        Behavior on b { SpringAnimation { spring: 3; damping: 0.45; epsilon: 0.002 } }
    }

    // ---- scenes --------------------------------------------------------
    property var front: layerA
    property var pending: null
    property string lastKind: ""

    // Build the next scene on the hidden layer; it fades in once painted.
    function next(kind) {
        if (width <= 0 || height <= 0) return;
        const kinds = Scenes.KINDS.filter(k => k !== lastKind);
        if (!kind || Scenes.KINDS.indexOf(kind) < 0) kind = kinds[Math.floor(Math.random() * kinds.length)];
        lastKind = kind;

        const k = height / 1080;
        const px = Math.round(k * (zoomMin + Math.random() * (zoomMax - zoomMin)));
        const spin = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 17);
        const tilt = 30 + Math.random() * 15;
        // Plane area that covers the screen at this angle, plus room to wander.
        const t = spin * Math.PI / 180, c = Math.cos(tilt * Math.PI / 180);
        const pad = 2 * panRadius * height + 4 * px;
        const w = width * Math.abs(Math.cos(t)) + height / c * Math.abs(Math.sin(t)) + pad;
        const h = width * Math.abs(Math.sin(t)) + height / c * Math.abs(Math.cos(t)) + pad;
        const b = Scenes.build(kind, Math.ceil(w / px), Math.ceil(h / px),
                               Math.floor(Math.random() * 0x7fffffff), stats.words());

        // The canvas paints on the next rendered frame, so a scene built while the wallpaper
        // is covered fades in when the desktop is next visible.
        pending = front === layerA ? layerB : layerA;
        pending.show(b, px, spin, tilt);
    }

    function adopt(l) {
        if (l !== pending) return;
        pending = null;
        front.shown = false;
        l.shown = true;
        front = l;
        sceneShown();
    }

    Timer {
        running: !scene.paused
        repeat: true
        interval: scene.sceneSeconds * 1000
        onTriggered: {
            scene.next();
            interval = scene.sceneSeconds * (0.75 + Math.random() * 0.5) * 1000;
        }
    }
    Component.onCompleted: Qt.callLater(next)
    onWidthChanged: if (!front.bitmap) Qt.callLater(next)

    // ---- wander --------------------------------------------------------
    // The camera follows a sum of slow sines: it curves in every direction and never leaves
    // panRadius. Pausing springs the curve's speed to 0; at rest the frame timer stops.
    property real t: Math.random() * 1000
    property real speed: 0            // 0..1 of panSpeed; starts at rest and spins up
    property real speedVel: 0
    readonly property real radius: panRadius * height
    readonly property real ox: radius * (0.6 * Math.sin(t * 1.0) + 0.4 * Math.sin(t * 2.31 + 1.7))
    readonly property real oy: radius * (0.6 * Math.sin(t * 0.83 + 0.4) + 0.4 * Math.sin(t * 1.93 + 2.9))
    property real _last: Date.now()

    Timer {
        interval: 1000 / scene.fps
        repeat: true
        running: !scene.paused || scene.speed > 0
        onRunningChanged: scene._last = Date.now()
        onTriggered: {
            const now = Date.now();
            const dt = Math.min((now - scene._last) / 1000, 0.25);   // clamp after suspend/resume
            scene._last = now;
            const ks = scene.speedStiffness, target = scene.paused ? 0 : 1;
            // critically damped spring (damping = 2·√k): no overshoot, interruptible
            scene.speedVel += (ks * (target - scene.speed) - 2 * Math.sqrt(ks) * scene.speedVel) * dt;
            scene.speed = Math.max(0, scene.speed + scene.speedVel * dt);
            if (scene.paused && scene.speed < 0.02) { scene.speed = 0; scene.speedVel = 0; }
            scene.t += scene.panSpeed * scene.speed * dt;
        }
    }
    // --------------------------------------------------------------------

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.lighter(scene.base, 1.12) }
            GradientStop { position: 1.0; color: Qt.darker(scene.base, 1.18) }
        }
    }

    SceneLayer {
        id: layerA
        anchors.fill: parent
        ox: scene.ox; oy: scene.oy; ink: scene.ink
        onReady: scene.adopt(layerA)
    }
    SceneLayer {
        id: layerB
        anchors.fill: parent
        ox: scene.ox; oy: scene.oy; ink: scene.ink
        onReady: scene.adopt(layerB)
    }
}
