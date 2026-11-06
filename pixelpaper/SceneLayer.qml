import QtQuick

// One scene, painted once into one canvas and moved as a single item.
// Ink is painted black and the whole canvas is drawn at `ink` opacity, so it darkens
// whatever base colour is underneath: palette, spectrum and light/dark changes never repaint.
Item {
    id: sl

    property var bitmap: null         // { w, h, bits } from scenes.js
    property real px: 16              // screen pixels per scene cell
    property real spin: 18            // degrees, in-plane rotation
    property real tilt: 41            // degrees, orthographic lean-back
    property real ox: 0               // pan offset in plane coordinates
    property real oy: 0
    property real ink: 0.2            // ink strength: 0 = invisible, 1 = black
    property real shadow: 0.55        // shadow darkness relative to ink
    property bool shown: false

    signal ready()                    // painted and safe to fade in

    opacity: shown ? 1 : 0
    visible: opacity > 0.005
    Behavior on opacity { SpringAnimation { spring: 1.2; damping: 0.5; epsilon: 0.003 } }
    onOpacityChanged: if (!shown && opacity <= 0.005) release()

    function show(b, newPx, newSpin, newTilt) {
        loader.active = false;        // drop the old canvas and its memory first
        bitmap = b; px = newPx; spin = newSpin; tilt = newTilt;
        loader.active = true;
    }
    function release() { loader.active = false; bitmap = null; }

    Item {
        id: field
        width: sl.bitmap ? sl.bitmap.w * sl.px : 0
        height: sl.bitmap ? sl.bitmap.h * sl.px : 0
        anchors.centerIn: parent

        transform: [
            Translate { x: sl.ox; y: sl.oy },
            Rotation {
                origin.x: field.width / 2; origin.y: field.height / 2
                axis { x: 0; y: 0; z: 1 }
                angle: sl.spin
            },
            Scale {   // orthographic tilt: squash depth instead of a perspective Rotation
                origin.x: field.width / 2; origin.y: field.height / 2
                yScale: Math.cos(sl.tilt * Math.PI / 180)
            }
        ]

        Loader {
            id: loader
            anchors.fill: parent
            active: false
            sourceComponent: Canvas {
                opacity: sl.ink
                renderTarget: Canvas.Image
                renderStrategy: Canvas.Threaded
                onAvailableChanged: if (available) requestPaint()
                onPainted: sl.ready()

                onPaint: {
                    const ctx = getContext("2d");
                    ctx.reset();
                    const b = sl.bitmap;
                    if (!b) return;
                    const p = sl.px, gap = Math.max(1, Math.round(p * 0.12)), s = p - gap;
                    // Soft shadow from two offset passes, then the ink on top. (Canvas shadowBlur
                    // costs ~3 s of CPU per scene at this size; plain passes cost a fraction.)
                    const passes = [[0.22, 0.32, sl.shadow * 0.45], [0.11, 0.16, sl.shadow * 0.55], [0, 0, 1]];
                    for (const [dx, dy, a] of passes) {
                        ctx.fillStyle = Qt.rgba(0, 0, 0, a);
                        ctx.beginPath();
                        for (let y = 0; y < b.h; y++) {
                            const row = y * b.w;
                            for (let x = 0; x < b.w; x++)
                                if (b.bits[row + x]) ctx.rect((x + dx) * p, (y + dy) * p, s, s);
                        }
                        ctx.fill();
                    }
                }
            }
        }
    }
}
