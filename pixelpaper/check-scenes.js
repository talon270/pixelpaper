// Self-check for scenes.js: node check-scenes.js [kind]   (prints an ASCII preview of one kind)
const fs = require("fs"), assert = require("assert");
const load = (f) => fs.readFileSync(__dirname + "/" + f, "utf8").replace(/^\.(pragma|import).*$/gm, "");
const Icons = new Function(load("icons.js") + "; return { pixels, KEYS, FIRST_LIVE };")();
const S = new Function("Icons", load("scenes.js") + "; return { build, KINDS, FONT, glyph };")(Icons);

for (const ch of Object.keys(S.FONT)) assert.strictEqual(S.FONT[ch].length, 14, `glyph ${ch}`);
const words = { host: "workstation", date: "Thu 5 Nov 2026", song: "Clair de Lune", artist: "Debussy", kernel: "7.3.1",
                uptime: "3h 12m", mem: 0.42, battery: -1, workspaces: ["Workspace 1", "web"] };
for (const kind of S.KINDS)
    for (const [w, h] of [[120, 80], [290, 260]])
        for (let seed = 1; seed <= 20; seed++) {
            const B = S.build(kind, w, h, seed, Object.assign({}, words));
            assert.strictEqual(B.bits.length, w * h);
            const ink = B.bits.reduce((a, b) => a + b, 0) / B.bits.length;
            assert.ok(ink > 0.02 && ink < 0.7, `${kind} ${w}x${h} seed ${seed}: ink ${ink.toFixed(2)}`);
        }
console.log(`ok: ${S.KINDS.length} kinds x 2 sizes x 20 seeds`);

const show = process.argv[2];
if (show) {
    const B = S.build(show, 200, 70, Number(process.argv[3] || 3), Object.assign({}, words));
    for (let y = 0; y < B.h; y++) {
        let row = "";
        for (let x = 0; x < B.w; x++) row += B.bits[y * B.w + x] ? "#" : " ";
        console.log(row.replace(/\s+$/, ""));
    }
}
