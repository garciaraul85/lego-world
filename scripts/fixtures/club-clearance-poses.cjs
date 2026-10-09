// Records the joint poses that tests/legacy/club-clearance.cjs compares against.
// Originally that suite read game-weapons.js etc. from git commit 2a9fc8f05c5144b21974e85c413fe4bf3cc354f9,
// which is not in this repository's history. The fixture freezes the v68 poses for every weapon
// except Mace (the suite's own exclusion), so later changes are still caught.
// Run: node scripts/fixtures/club-clearance-poses.cjs   (only when a card explicitly says to regenerate)
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const ROOT = path.join(__dirname, '../..');
const ctx = { Float32Array };
for (const [file, name] of [
  ['game-weapons.js', 'GameWeapons'],
  ['character-catalog.js', 'CharacterCatalog'],
  ['character-model.js', 'CharacterModel'],
]) {
  vm.runInNewContext(`${fs.readFileSync(path.join(ROOT, 'src/legacy', file), 'utf8')};globalThis.${name}=${name}`, ctx);
}
const M = ctx.CharacterModel,
  W = ctx.GameWeapons,
  C = ctx.CharacterCatalog;
const configs = [
  {},
  { gender: 'Female', breastSize: 100 },
  { outfit: 'Armor' },
  { cape: 'Poncho' },
  { gender: 'Female', breastSize: 100, outfit: 'Armor', cape: 'Poncho' },
  { gender: 'Female', outfit: 'Dress', dress: 'Ball gown' },
];
const out = {};
for (const [held, w] of Object.entries(W.catalog)) {
  if (held === 'Mace') continue;
  const partials = [
    {},
    { attack: w.duration * 0.6, attackDuration: w.duration },
    { buildBlend: 0.3, buildTime: 0.3 },
    { speed: 7.8, moveBlend: 1, runBlend: 1, phase: 1.4 },
    { grounded: false, airTime: 0.3, vy: 4 },
  ];
  out[held] = configs.map((config) =>
    partials.map((partial) => {
      const p = C.validate({ ...C.defaults, ...config, held }),
        s = { heading: 0.8, grounded: true, ...partial };
      return Object.fromEntries(Object.entries(M.jointPose(s, false, p)).map(([k, m]) => [k, Array.from(m)]));
    }),
  );
}
const file = path.join(ROOT, 'tests/fixtures/legacy/club-clearance-poses.v68.json');
fs.writeFileSync(file, JSON.stringify({ source: 'LEGO World v68 (commit b10789c)', poses: out }));
console.log('wrote', file, fs.statSync(file).size, 'bytes');
