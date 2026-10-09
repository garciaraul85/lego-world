// Writes tests/fixtures/legacy/save-*.json: one save per legacy `brick-builder` version.
// v1/v2: hand-written (v68 has no writer for them; it still reads them: pieces have no ids, ids = index + 1).
// v3:    hand-written single-map save in the shape tests/legacy/maps.cjs uses.
// v4:    produced by booting the real v68 app (tests/harness/legacy-boot.cjs) and driving its agent tools:
//        generated forest+city map, edited hero, a smashed object, a second map and a gate.
// Run: node scripts/fixtures/legacy-saves.cjs   (only when a card explicitly says to regenerate)
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { boot } = require('../../tests/harness/legacy-boot.cjs');
const OUT = path.join(__dirname, '../../tests/fixtures/legacy');

const v1 = {
  format: 'brick-builder',
  version: 1,
  pieces: [
    { rows: 8, cols: 8, kind: 'plate', color: 3, turn: 0, x: -4, z: -4, y: 0 },
    { rows: 2, cols: 4, kind: 'brick', color: 0, turn: 0, x: -2, z: -1, y: 1 },
    { rows: 2, cols: 4, kind: 'brick', color: 1, turn: 1, x: -1, z: -2, y: 4 },
  ],
};
const v2 = { ...v1, version: 2, environment: { time: 'evening', rain: true, snow: false, snowing: false } };
const ground = { id: 1, rows: 8, cols: 8, turn: 0, x: -4, z: -4, y: 0, kind: 'plate', color: 3 };
const tower = [1, 4, 7].map((y, i) => ({
  id: 2 + i,
  rows: 2,
  cols: 2,
  turn: 0,
  x: -1,
  z: -3,
  y,
  kind: 'brick',
  color: 8,
  group: 'tower',
}));
const v3 = { format: 'brick-builder', version: 3, pieces: [ground, ...tower] };

function loadIntoApp(b, obj) {
  b.fire('bb-open');
  b.elements['#bb-data'].value = JSON.stringify(obj);
  b.fire('bb-load-code');
  const msg = b.elements['#bb-dialog-message'].textContent;
  if (msg) throw new Error(`v68 rejected fixture v${obj.version}: ${msg}`);
}

const b = boot();
// Prove v68 accepts each hand-written save before writing it.
for (const save of [v1, v2, v3]) loadIntoApp(b, save);
const call = (n, v) => b.tools.get(n).execute(v);
call('generate_lego_world', {
  biomes: ['forest', 'city'],
  time: 'day',
  rain: false,
  snow: false,
  snowing: false,
  size: 16,
  seed: 418811,
});
call('configure_lego_character', { profile: { hair: 'Ponytail', height: 'Tall' } });
call('explore_lego_world', { playing: true });
call('control_lego_character', { smash: true });
call('explore_lego_world', { playing: false });
const first = call('read_brick_build').maps.activeId;
call('manage_lego_maps', {
  action: 'create',
  name: 'Prairie',
  config: { biomes: ['prairie'], time: 'noon', rain: false, snow: false, snowing: false, size: 16, seed: 372 },
});
call('manage_lego_maps', { action: 'connect', mapId: first, spawnId: 1 });
const v4 = JSON.parse(JSON.stringify(call('read_brick_build')));
if (v4.version !== 4) throw new Error('expected a v4 save');

const files = { 'save-v1.json': v1, 'save-v2.json': v2, 'save-v3.json': v3, 'save-v4.json': v4 };
const lines = [];
for (const [name, obj] of Object.entries(files)) {
  const text = `${JSON.stringify(obj, null, 1)}\n`;
  fs.writeFileSync(path.join(OUT, name), text);
  lines.push(`| ${name} | ${crypto.createHash('sha256').update(text).digest('hex')} |`);
}
console.log(lines.join('\n'));
console.log(
  'v4:',
  v4.pieces.length,
  'pieces,',
  v4.maps.maps.length,
  'maps,',
  v4.broken.length,
  'broken,',
  (v4.npcs || []).length,
  'npcs',
);
