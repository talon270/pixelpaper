// Self-check for icons.js: node check-icons.js
const src = require("fs").readFileSync(__dirname + "/icons.js", "utf8").replace(".pragma library", "");
const I = new Function(src + "; return { SPRITES, KEYS, FIRST_LIVE, COUNT, pixels, pick };")();
const assert = require("assert");

I.SPRITES.forEach((s, i) => {
    if (typeof s === "function") return;
    assert.strictEqual(s.length, 16, `sprite ${i}: ${s.length} rows`);
    s.forEach((row, y) => assert.strictEqual(row.length, 16, `sprite ${i} row ${y}: ${row.length} cols`));
});

for (let k = 0; k < I.COUNT; k++) {
    const pts = I.pixels(k, 10, 42, 0.5, -1);
    assert.ok(pts.length > 0, `kind ${k} is empty`);
    for (const [x, y] of pts) assert.ok(x >= 0 && x < 16 && y >= 0 && y < 16, `kind ${k} out of bounds: ${x},${y}`);
}

const seen = new Map();
for (let lap = 0; lap > -50; lap--)
    for (let c = 0; c < 8; c++)
        for (let r = 0; r < 6; r++) {
            const k = I.pick(c, r, lap, lap, 12345);
            seen.set(k, (seen.get(k) || 0) + 1);
        }
assert.strictEqual(seen.size, I.COUNT + 1, `only ${seen.size} of ${I.COUNT + 1} outcomes picked`);
console.log(`ok: ${I.COUNT} kinds, all picked; empty ${(seen.get(-1) / 2400 * 100).toFixed(0)}%`);
