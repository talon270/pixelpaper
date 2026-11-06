.pragma library
.import "icons.js" as Icons

// Scene generator: one large 1-bit picture of an old-style desktop, zoomed in.
// build(kind, cols, rows, seed, words) -> { w, h, bits: Uint8Array(w*h) }, 1 = ink.
// The picture is bigger than the screen; the camera in Scene.qml shows a tilted slice of it.
// words: live text { host, user, date, song, artist, kernel, uptime, mem, battery, workspaces[] }.

// ---- 5x7 font: 7 rows per glyph, 2 hex digits per row, bit 4 = left column ----
var FONT = {
    "A": "0e1111111f1111", "B": "1e11111e11111e", "C": "0e11101010110e", "D": "1c12111111121c",
    "E": "1f10101e10101f", "F": "1f10101e101010", "G": "0e11101711110f", "H": "1111111f111111",
    "I": "0e04040404040e", "J": "0702020202120c", "K": "11121418141211", "L": "1010101010101f",
    "M": "111b1515111111", "N": "11111915131111", "O": "0e11111111110e", "P": "1e11111e101010",
    "Q": "0e11111115120d", "R": "1e11111e141211", "S": "0f10100e01011e", "T": "1f040404040404",
    "U": "1111111111110e", "V": "11111111110a04", "W": "1111111515150a", "X": "11110a040a1111",
    "Y": "1111110a040404", "Z": "1f01020408101f",
    "a": "00000e010f110f", "b": "1010161911111e", "c": "00000e1010110e", "d": "01010d1311110f",
    "e": "00000e111f100e", "f": "0609081c080808", "g": "000f11110f010e", "h": "10101619111111",
    "i": "04000c0404040e", "j": "0200060202120c", "k": "10101214181412", "l": "0c04040404040e",
    "m": "00001a15151111", "n": "00001619111111", "o": "00000e1111110e", "p": "00001e111e1010",
    "q": "00000d130f0101", "r": "00001619101010", "s": "00000e100e011e", "t": "08081c08080906",
    "u": "0000111111130d", "v": "00001111110a04", "w": "0000111115150a", "x": "0000110a040a11",
    "y": "000011110f010e", "z": "00001f0204081f",
    "0": "0e11131519110e", "1": "040c040404040e", "2": "0e11010204081f", "3": "1f02040201110e",
    "4": "02060a121f0202", "5": "1f101e0101110e", "6": "0608101e11110e", "7": "1f010204080808",
    "8": "0e11110e11110e", "9": "0e11110f01020c",
    " ": "00000000000000", ".": "00000000000c0c", ",": "000000000c0408", ":": "000c0c000c0c00",
    "-": "0000001f000000", "/": "00010204081000", "!": "04040404040004", "?": "0e110102040004",
    "'": "0c040800000000", "(": "02040808080402", ")": "08040202020408", "%": "18190204081303",
    "+": "0004041f040400", "_": "0000000000001f", "&": "0c12140815120d", "~": "00000815020000",
    "*": "0004150e150400", "=": "00001f001f0000", "#": "0a0a1f0a1f0a0a", "@": "0e11171517100e"
};
var ROWS = {};                                   // parsed lazily: char -> [7 row bitmasks]
function glyph(ch) {
    if (!FONT[ch]) {
        try { ch = ch.normalize("NFD").charAt(0); } catch (e) {}   // é -> e
        if (!FONT[ch]) ch = "?";
    }
    if (!ROWS[ch]) {
        var r = [];
        for (var i = 0; i < 7; i++) r.push(parseInt(FONT[ch].substr(i * 2, 2), 16));
        ROWS[ch] = r;
    }
    return ROWS[ch];
}

// ---- random ----
var R = Math.random;
function rng(seed) {                              // mulberry32
    var a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function rint(a, b) { return a + Math.floor(R() * (b - a + 1)); }
function pickOne(list) { return list[Math.floor(R() * list.length)]; }
function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
}

// ---- drawing primitives (B = bitmap) ----
function set(B, x, y, v) {
    var c = B.clip;                               // optional clip rect: content stays inside its window
    if (c && (x < c.x || y < c.y || x >= c.x + c.w || y >= c.y + c.h)) return;
    if (x >= 0 && y >= 0 && x < B.w && y < B.h) B.bits[y * B.w + x] = v;
}
function hline(B, x0, x1, y, v) { for (var x = x0; x <= x1; x++) set(B, x, y, v === undefined ? 1 : v); }
function vline(B, x, y0, y1, v) { for (var y = y0; y <= y1; y++) set(B, x, y, v === undefined ? 1 : v); }
function box(B, x, y, w, h) { hline(B, x, x + w - 1, y); hline(B, x, x + w - 1, y + h - 1); vline(B, x, y, y + h - 1); vline(B, x + w - 1, y, y + h - 1); }

// Dither patterns, phased on absolute cells so neighbouring fills line up.
var PAT = {
    solid:   function (x, y) { return true; },
    checker: function (x, y) { return (x + y) % 2 === 0; },                 // 50%
    sparse:  function (x, y) { return x % 2 === 0 && y % 2 === 0; },       // 25%
    dense:   function (x, y) { return !(x % 2 === 1 && y % 2 === 1); },    // 75%
    diag:    function (x, y) { return (x + y) % 4 === 0; },
    stripe:  function (x, y) { return y % 2 === 0; }
};
function fill(B, x, y, w, h, pat, v) {
    var p = PAT[pat || "solid"];
    for (var j = y; j < y + h; j++) for (var i = x; i < x + w; i++) if (p(i, j)) set(B, i, j, v === undefined ? 1 : v);
}
function clear(B, x, y, w, h) { fill(B, x, y, w, h, "solid", 0); }

function textWidth(str, s, bold) { return Math.max(0, String(str).length * (6 * s + (bold ? 1 : 0)) - s); }
function text(B, x, y, str, s, bold, v) {
    s = s || 1; v = v === undefined ? 1 : v;
    str = String(str);
    var adv = 6 * s + (bold ? 1 : 0);          // bold = smear one cell right
    for (var n = 0; n < str.length; n++) {
        var g = glyph(str.charAt(n)), gx = x + n * adv;
        for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) {
            if (!(g[r] & (16 >> c))) continue;
            fill(B, gx + c * s, y + r * s, s + (bold ? 1 : 0), s, "solid", v);
        }
    }
    return textWidth(str, s, bold);
}
function textCentered(B, cx, y, str, s, bold, v) { return text(B, cx - Math.floor(textWidth(str, s, bold) / 2), y, str, s, bold, v); }
function wrap(str, maxChars) {                    // greedy word wrap
    var out = [], line = "";
    String(str).split(" ").forEach(function (w) {
        if (line && (line + " " + w).length > maxChars) { out.push(line); line = w; }
        else line = line ? line + " " + w : w;
    });
    if (line) out.push(line);
    return out;
}
function sprite(B, kind, x, y, s, words) {
    var pts = Icons.pixels(kind, 10, 10, words.mem, words.battery);
    for (var i = 0; i < pts.length; i++) fill(B, x + pts[i][0] * s, y + pts[i][1] * s, s, s);
}

// ---- widgets ----
var UP = ["...#...", "..#.#..", ".#...#.", "###.###", "..#.#..", "..###.."];
function arrow(B, x, y, down) {
    for (var r = 0; r < 6; r++) for (var c = 0; c < 7; c++)
        if (UP[down ? 5 - r : r].charAt(c) === "#") set(B, x + c, y + r, 1);
}
function scrollbar(B, x, y, w, h) {               // vertical, w wide
    clear(B, x, y, w, h);
    box(B, x, y, w, w); arrow(B, x + Math.floor((w - 7) / 2), y + Math.floor((w - 6) / 2), false);
    box(B, x, y + h - w, w, w); arrow(B, x + Math.floor((w - 7) / 2), y + h - w + Math.floor((w - 6) / 2), true);
    fill(B, x + 1, y + w, w - 2, h - 2 * w, "checker");
    vline(B, x, y + w, y + h - w); vline(B, x + w - 1, y + w, y + h - w);
    var ty = y + w + rint(0, Math.max(0, h - 3 * w));
    clear(B, x + 1, ty, w - 2, w); box(B, x, ty, w, w);
}
function window_(B, x, y, w, h, title, withScroll) {
    clear(B, x, y, w, h);
    box(B, x, y, w, h);
    hline(B, x + 1, x + w, y + h); vline(B, x + w, y + 1, y + h);          // 1-cell drop shadow
    var tb = 11;
    hline(B, x, x + w - 1, y + tb);
    for (var r = y + 2; r < y + tb - 1; r += 2) hline(B, x + 2, x + w - 3, r);
    clear(B, x + 7, y + 1, 11, 9); box(B, x + 8, y + 2, 9, 7);            // close box
    if (title) {
        var tw = textWidth(title, 1, true), tx = x + Math.floor((w - tw) / 2);
        clear(B, tx - 4, y + 1, tw + 8, tb - 1);
        text(B, tx, y + 2, title, 1, true);
    }
    var c = { x: x + 1, y: y + tb + 1, w: w - 2, h: h - tb - 2 };
    if (withScroll) {
        scrollbar(B, x + w - 13, y + tb, 13, h - tb);
        c.w -= 12;
    }
    return c;
}
function roundBox(B, x, y, w, h) {
    hline(B, x + 2, x + w - 3, y); hline(B, x + 2, x + w - 3, y + h - 1);
    vline(B, x, y + 2, y + h - 3); vline(B, x + w - 1, y + 2, y + h - 3);
    set(B, x + 1, y + 1, 1); set(B, x + w - 2, y + 1, 1); set(B, x + 1, y + h - 2, 1); set(B, x + w - 2, y + h - 2, 1);
}
function button(B, x, y, w, h, label, s, isDefault) {
    clear(B, x, y, w, h);
    roundBox(B, x, y, w, h);
    if (isDefault) { roundBox(B, x - 3, y - 3, w + 6, h + 6); roundBox(B, x - 2, y - 2, w + 4, h + 4); }
    textCentered(B, x + Math.floor(w / 2), y + Math.floor((h - 7 * s) / 2), label, s, false);
}
function checkbox(B, x, y, label, checked, s) {
    box(B, x, y, 9, 9);
    if (checked) for (var i = 1; i < 8; i++) { set(B, x + i, y + i, 1); set(B, x + 8 - i, y + i, 1); }
    text(B, x + 14, y + 1 - Math.floor((7 * s - 7) / 2), label, s, false);
}
function radio(B, x, y, label, on, s) {
    var O = [".###.", "#...#", "#...#", "#...#", ".###."];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 5; c++) if (O[r].charAt(c) === "#") fill(B, x + c * 2 - 0, y + r * 2, 2, 2);
    if (on) fill(B, x + 3, y + 3, 4, 4);
    text(B, x + 15, y + 1 - Math.floor((7 * s - 7) / 2), label, s, false);
}
function slider(B, x, y, w, value) {
    box(B, x, y + 3, w, 5); fill(B, x + 1, y + 4, w - 2, 3, "checker");
    var kx = x + Math.round(Math.max(0, Math.min(1, value)) * (w - 11));
    clear(B, kx, y, 11, 11); box(B, kx, y, 11, 11); vline(B, kx + 5, y + 2, y + 8);
}
function keycap(B, x, y, w, h, label, s) {
    clear(B, x, y, w + 1, h + 1);
    box(B, x, y, w, h);
    hline(B, x + 1, x + w, y + h); vline(B, x + w, y + 1, y + h);          // raised edge
    textCentered(B, x + Math.floor(w / 2), y + Math.floor((h - 7 * s) / 2), label, s, true);
}
function rule(B, y, x0, x1) {                     // double line with a dithered band
    hline(B, x0, x1, y); fill(B, x0, y + 1, x1 - x0 + 1, 3, "checker"); hline(B, x0, x1, y + 4);
}

// ---- text pools (original wording) ----
var SOUNDS = ["Plink", "Tock", "Whirr", "Bloop", "Ping", "Thud", "Chirp", "Zap", "Purr", "Drip", "Clack", "Hum", "Wobble"];
var FOLDERS = ["Documents", "Music", "Pictures", "Projects", "Downloads", "dotfiles", "Notes", "Videos", "Archive", "Scripts", "Games", "Sketches"];
var PANGRAMS = ["Sphinx of black quartz", "judge my vow", "Pack my box with", "five dozen jugs",
                "How vexingly quick", "daft zebras jump", "The five boxing", "wizards jump quickly"];
var SETTINGS = ["Pointer Speed", "Key Repeat", "Volume", "Brightness", "Night Light", "Blink Rate", "Scroll Speed"];
var OBJECTS = [0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

function liveLines(w) {
    var out = [w.host, w.date];
    if (w.song) out.push(w.song);
    if (w.artist) out.push(w.artist);
    return out.filter(function (s) { return !!s; });
}

// ---- scenes ----
// Each draws into B. Content starts near the top-left of the visible middle and runs off
// the far edges, so the camera always sees a fragment, never a whole small window.

function sceneList(B, w) {
    var x = Math.round(B.w * (0.12 + R() * 0.08)), y = Math.round(B.h * (0.12 + R() * 0.08));
    var variants = [
        { title: "Sound", head: "Notification Sound", items: shuffle(SOUNDS) },
        { title: w.host, head: "Workspaces", items: (w.workspaces.length ? w.workspaces : []).concat(shuffle(FOLDERS)) }
    ];
    if (w.song) variants.push({ title: "Music", head: "Now Playing", items: [w.song, w.artist || "Unknown Artist"].concat(shuffle(SOUNDS)) });
    var v = pickOne(variants);
    var c = window_(B, x, y, B.w, B.h, v.title, false);
    B.clip = c;
    var s = pickOne([1, 2]);
    text(B, c.x + 10, c.y + 8, v.head, 2, true);
    var lx = c.x + 10, ly = c.y + 8 + 14 + 10, lw = Math.round(c.w * 0.6), lh = c.h;
    box(B, lx, ly, lw, lh);
    scrollbar(B, lx + lw - 13, ly, 13, Math.min(lh, B.h - ly - 2));
    var rowH = 11 * s, sel = rint(0, Math.min(4, v.items.length - 1));
    for (var i = 0; i < v.items.length; i++) {
        var ry = ly + 3 + i * rowH;
        if (ry > B.h) break;
        if (i === sel) { fill(B, lx + 2, ry - 2, lw - 17, rowH - 1); text(B, lx + 6, ry + 1, v.items[i], s, false, 0); }
        else text(B, lx + 6, ry + 1, v.items[i], s, false);
    }
    // right-hand column: a checkbox group
    var rx = lx + lw + 16;
    text(B, rx, ly, "Alerts", 1, true);
    ["Play sound", "Flash screen", "Bounce icon"].forEach(function (lab, k) { checkbox(B, rx, ly + 16 + k * 16, lab, R() < 0.6, 1); });
    B.clip = null;
}

function sceneSpecimen(B, w) {
    var lines = shuffle(liveLines(w).concat(PANGRAMS));
    var y = Math.round(B.h * (0.05 + R() * 0.05)), x0 = 0, x1 = B.w - 1;
    var sizes = [9, 10, 12, 14, 18, 24];
    for (var i = 0; y < B.h; i++) {
        rule(B, y, x0, x1);
        var s = pickOne([2, 2, 3]);
        var tx = Math.round(B.w * (0.08 + R() * 0.1));
        text(B, tx, y + 10, lines[i % lines.length], s, R() < 0.5);
        var ty = y + 10 + 7 * s + 8;
        // ruler: dotted leader with tick marks and point sizes
        for (var x = x0; x <= x1; x += 2) set(B, x, ty + 6, 1);
        for (var k = 0; k * 40 < B.w; k++) {
            var kx = tx + k * 40;
            vline(B, kx, ty + 2, ty + 6);
            text(B, kx + 3, ty - 2, String(sizes[(i + k) % sizes.length]), 1, false);
        }
        y = ty + 16;
    }
}

function sceneIcons(B, w) {
    var x = Math.round(B.w * (0.1 + R() * 0.1)), y = Math.round(B.h * (0.1 + R() * 0.1));
    var c = window_(B, x, y, Math.round(B.w * (0.7 + R() * 0.3)) - x, B.h, "~/" + pickOne(FOLDERS), true);
    B.clip = c;
    var labels = shuffle(FOLDERS.concat(w.workspaces));
    var n = labels.length + rint(3, 30);
    text(B, c.x + 8, c.y + 3, n + " items", 1, false);
    text(B, c.x + 8 + 120, c.y + 3, Math.round((1 - w.mem) * 100) + "% memory free", 1, false);
    hline(B, c.x, c.x + c.w, c.y + 13); hline(B, c.x, c.x + c.w, c.y + 15);
    var s = pickOne([1, 2]), cell = 16 * s, stepX = Math.max(cell + 30, 72), stepY = cell + 22;
    var maxChars = Math.floor((stepX - 8) / 6);
    var k = 0;
    for (var gy = c.y + 26; gy < B.h; gy += stepY)
        for (var gx = c.x + 18; gx < c.x + c.w - cell; gx += stepX, k++) {
            if (R() < 0.12) continue;
            sprite(B, pickOne(OBJECTS), gx, gy, s, w);
            var lab = labels[k % labels.length];
            if (lab.length > maxChars) lab = lab.substr(0, maxChars - 1) + ".";
            textCentered(B, gx + cell / 2, gy + cell + 4, lab, 1, false);
        }
    B.clip = null;
}

function sceneKeypad(B, w) {
    var s = pickOne([2, 3]), kw = 9 * s + 12, kh = 9 * s + 8, gap = 6;
    var x = Math.round(B.w * (0.15 + R() * 0.1)), y = Math.round(B.h * (0.12 + R() * 0.08));
    var c = window_(B, x, y, 4 * (kw + gap) + 30, B.h, "Calculator", false);
    var disp = pickOne([w.date.replace(/[^0-9]+/g, ".").replace(/^\.|\.$/g, ""), String(Math.round(w.mem * 100)) + "%", "3.14159"]);
    B.clip = c;
    var dh = 7 * s + 12;
    box(B, c.x + 10, c.y + 10, c.w - 20, dh);
    var dw = textWidth(disp, s, true);
    text(B, c.x + c.w - 16 - dw, c.y + 16, disp, s, true);
    var keys = ["C", "=", "/", "*", "7", "8", "9", "-", "4", "5", "6", "+", "1", "2", "3", "%", "0", ".", "(", ")"];
    for (var i = 0; i < keys.length; i++) {
        var kx = c.x + 12 + (i % 4) * (kw + gap), ky = c.y + 22 + dh + Math.floor(i / 4) * (kh + gap);
        keycap(B, kx, ky, kw, kh, keys[i], s);
    }
    // a second, overlapping window peeks out to the right
    B.clip = null;
    var c2 = window_(B, x + 4 * (kw + gap) + 50, y + 30, B.w, B.h, "Tape", true);
    B.clip = c2;
    for (var r = 0; c2.y + 8 + r * 12 < B.h; r++) {
        var a = rint(1, 999), b = rint(1, 99);
        text(B, c2.x + 10, c2.y + 8 + r * 12, a + " " + pickOne(["+", "-", "*"]) + " " + b, 1, false);
    }
    B.clip = null;
}

function sceneControls(B, w) {
    var x = Math.round(B.w * (0.1 + R() * 0.1)), y = Math.round(B.h * (0.1 + R() * 0.1));
    var c = window_(B, x, y, Math.round(B.w * (0.75 + R() * 0.3)) - x, B.h, "Preferences", true);
    B.clip = c;
    var s = pickOne([1, 2]), cy = c.y + 12, col = c.x + 14, width = Math.max(90, Math.round(c.w * 0.45));
    var items = shuffle(SETTINGS).slice(0, 4).map(function (n) { return { name: n, v: R() }; });
    if (w.battery >= 0) items.unshift({ name: "Battery " + Math.round(w.battery * 100) + "%", v: w.battery });
    items.unshift({ name: "Memory " + Math.round(w.mem * 100) + "%", v: w.mem });
    items.forEach(function (it) {
        text(B, col, cy, it.name, s, true);
        cy += 7 * s + 6;
        slider(B, col, cy, width, it.v);
        text(B, col, cy + 14, "Slow", 1, false);
        text(B, col + width - textWidth("Fast", 1, false), cy + 14, "Fast", 1, false);
        cy += 32;
    });
    var widest = Math.max.apply(null, items.map(function (it) { return textWidth(it.name, s, true); }));
    var rx = col + Math.max(width, widest) + 30, ry = c.y + 12;
    text(B, rx, ry, "Theme", s, true); ry += 7 * s + 8;
    var on = rint(0, 2);
    ["Light", "Dark", "Automatic"].forEach(function (lab, k) { radio(B, rx, ry, lab, k === on, s); ry += 12 + 4 * s; });
    ry += 10;
    text(B, rx, ry, "Options", s, true); ry += 7 * s + 8;
    ["Show seconds", "Smooth scroll", "Sticky keys"].forEach(function (lab) { checkbox(B, rx, ry, lab, R() < 0.5, s); ry += 12 + 4 * s; });
    ry += 12;
    button(B, rx, ry, 60, 20, "Revert", 1, false);
    button(B, rx + 74, ry, 60, 20, "Apply", 1, true);
    B.clip = null;
}

function sceneField(B, w) {
    var s = pickOne([1, 2]), cell = 16 * s, step = cell + pickOne([10, 16, 24]);
    // a few dithered patches behind the icons
    for (var p = 0; p < 6; p++)
        fill(B, rint(0, B.w), rint(0, B.h), rint(40, 140), rint(30, 100), pickOne(["sparse", "diag", "checker"]));
    for (var r = 0, gy = 4; gy < B.h; r++, gy += step)
        for (var gx = (r % 2) * Math.floor(step / 2); gx < B.w; gx += step) {
            if (R() < 0.25) continue;
            clear(B, gx - 2, gy - 2, cell + 4, cell + 4);
            sprite(B, R() < 0.85 ? pickOne(OBJECTS) : Icons.KEYS + rint(0, 16), gx, gy, s, w);
        }
}

function sceneDialog(B, w) {
    fill(B, 0, 0, B.w, B.h, pickOne(["sparse", "diag"]));
    var s = 2, msgs = [
        w.host + " has been awake for " + w.uptime + ".",
        "Memory is " + Math.round(w.mem * 100) + "% full. Keep drifting anyway?",
        "Nothing needs your attention right now."
    ];
    if (w.song) msgs.push("Now playing " + w.song + (w.artist ? " by " + w.artist : "") + ".");
    if (w.kernel) msgs.push("Running Linux " + w.kernel + ".");
    var chars = Math.max(8, Math.min(22, Math.floor((B.w * 0.75 - 90) / (6 * s))));   // fit the bitmap
    var lines = wrap(pickOne(msgs), chars);
    var dw = Math.max(textWidth("x".repeat(chars), s, false) + 90, 230), dh = 60 + lines.length * 9 * s + 50;
    var x = Math.round(B.w / 2 - dw / 2 + (R() - 0.5) * 60), y = Math.round(B.h / 2 - dh / 2 + (R() - 0.5) * 40);
    clear(B, x - 6, y - 6, dw + 13, dh + 13);
    box(B, x - 4, y - 4, dw + 8, dh + 8); box(B, x - 3, y - 3, dw + 6, dh + 6);   // double frame
    box(B, x, y, dw, dh);
    sprite(B, pickOne([23, 0, 7, 29, 24]), x + 14, y + 16, 3, w);
    for (var i = 0; i < lines.length; i++) text(B, x + 74, y + 18 + i * 9 * s, lines[i], s, false);
    button(B, x + dw - 200, y + dh - 36, 80, 22, "Later", 1, false);
    button(B, x + dw - 100, y + dh - 36, 80, 22, "OK", 1, true);
}

var KINDS = ["list", "specimen", "icons", "keypad", "controls", "field", "dialog"];
var SCENES = { list: sceneList, specimen: sceneSpecimen, icons: sceneIcons, keypad: sceneKeypad,
               controls: sceneControls, field: sceneField, dialog: sceneDialog };

function build(kind, cols, rows, seed, words) {
    R = rng(seed);
    var B = { w: cols, h: rows, bits: new Uint8Array(cols * rows) };
    var w = words || {};
    w.workspaces = w.workspaces || [];
    w.mem = w.mem || 0; if (w.battery === undefined) w.battery = -1;
    w.host = w.host || "localhost"; w.date = w.date || ""; w.uptime = w.uptime || "a while";
    SCENES[kind](B, w);
    return B;
}
