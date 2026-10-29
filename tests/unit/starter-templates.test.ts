import { describe, expect, it } from 'vitest';
import { STARTER_CHARACTERS } from '../../src/builtin/characters';
import { CUTSCENE_TEMPLATES } from '../../src/builtin/templates/cutscenes';
import { SCRIPT_TEMPLATES } from '../../src/builtin/templates/scripts';
import { gatherItem, importCommands, packText, readPack } from '../../src/core/library/library';
import { parseCode } from '../../src/core/logic/code/parse';
import { printGraph } from '../../src/core/logic/code/print';
import { Cinematic, type LogicGraph } from '../../src/core/schema';
import { LogicRuntime } from '../../src/engine/logic/interpreter';

/** Step 11, 4c: script and cutscene templates, the logic they need, and My library */
const answers = (fields: { key: string; kind: string; default: string | number }[]) =>
  Object.fromEntries(
    fields.map((f) => [f.key, f.default === '' ? (f.kind === 'zone' ? 'Pond' : f.kind === 'spawn' ? 'Arrival' : '') : f.default]),
  );

describe('script templates', () => {
  it('ten templates; each writes code the logic language reads and prints back', () => {
    expect(SCRIPT_TEMPLATES).toHaveLength(10);
    expect(new Set(SCRIPT_TEMPLATES.map((t) => t.id)).size).toBe(10);
    for (const t of SCRIPT_TEMPLATES) {
      const code = t.code(answers(t.fields), (x) => x);
      const r = parseCode(code);
      expect('error' in r ? r.error.message : '', t.id).toBe('');
      if ('error' in r) continue;
      expect(r.nodes.length, t.id).toBeGreaterThan(2);
      expect(() => printGraph(r), t.id).not.toThrow();
    }
  });

  it('a variable name already in the game gets a number', () => {
    const t = SCRIPT_TEMPLATES.find((x) => x.id === 'boss')!;
    const code = t.code(answers(t.fields), (x) => `${x}2`);
    expect(code).toContain('vars.bossHits2 += 1');
  });
});

describe('cutscene templates', () => {
  it('three valid scenes, and the logic that plays them', () => {
    expect(CUTSCENE_TEMPLATES).toHaveLength(3);
    for (const t of CUTSCENE_TEMPLATES) {
      const a = { ...answers(t.fields), zone: 'Pond' };
      const cine = t.make({
        id: 'cin_test000001',
        map: 'map_test000001',
        name: t.title(a),
        answers: a,
        hero: { pos: [0, 0.4, 0], yaw: 0 },
        boss: { character: STARTER_CHARACTERS[0]!.id, pos: [5, 0.4, 5] },
        door: [3, 0, -6],
      });
      const r = Cinematic.safeParse(cine);
      expect(r.success ? '' : JSON.stringify(r.error.issues[0]), t.id).toBe('');
      const code = t.code(a, cine.id);
      expect(code, t.id).toContain('cinematic.play("cin_test000001", true)');
      const parsed = parseCode(code);
      expect('error' in parsed, t.id).toBe(false);
    }
  });
});

describe('the logic templates need', () => {
  const run = (code: string, items: Map<string, number>) => {
    const parsed = parseCode(code);
    if ('error' in parsed) throw new Error(parsed.error.message);
    const g = { id: 'lg_test000001', name: 't', scope: 'global', ...parsed } as LogicGraph;
    const said: string[] = [];
    const follows: string[] = [];
    const ctx = {
      getVar: () => undefined,
      setVar: () => {},
      log: () => {},
      emit: () => {},
      random: () => 0.5,
      setState: () => {},
      teleport: () => {},
      travel: () => {},
      give: (i: string, n: number) => items.set(i, (items.get(i) ?? 0) + n),
      spawn: () => null,
      spawnNear: () => null,
      despawn: () => {},
      media: () => {},
      inZone: () => [],
      damage: () => {},
      heal: () => {},
      setInvulnerable: () => {},
      say: (t: string) => said.push(t),
      count: (i: string) => items.get(i) ?? 0,
      take: (i: string, n: number) => items.set(i, Math.max(0, (items.get(i) ?? 0) - n)),
      follow: (w: string, on: boolean) => follows.push(`${w}:${on}`),
    };
    const rt = new LogicRuntime([g], undefined, ctx as never);
    return { rt, said, follows };
  };

  it('a shop: counts and takes coins, gives the item, says so', () => {
    const t = SCRIPT_TEMPLATES.find((x) => x.id === 'shop')!;
    const items = new Map([['coin', 15]]);
    const { rt, said } = run(t.code(answers(t.fields), (x) => x), items);
    const fire = () => rt.fire({ type: 'event.onInteract', match: { asset: 'Barrel' } }, true);
    fire();
    expect(items.get('coin')).toBe(5);
    expect(items.get('Bomb')).toBe(5);
    fire();
    expect(items.get('coin')).toBe(5);
    expect(said.at(-1)).toMatch(/costs 10 coin/);
  });

  it('On defeated with Who matches that character only, whatever its capitals', () => {
    const items = new Map<string, number>();
    const { rt, said } = run(
      'on("defeated", { who: "gloomweaver" }, (e) => {\n  say("beaten", 2);\n});\n',
      items,
    );
    rt.fire({ type: 'event.onDefeated', match: { asset: '', who: 'Rattlebones' } }, true);
    expect(said).toEqual([]);
    rt.fire({ type: 'event.onDefeated', match: { asset: '', who: 'Gloomweaver' } }, true);
    expect(said).toEqual(['beaten']);
  });

  it('follow on and off', () => {
    const { rt, follows } = run(
      'on("start", (e) => {\n  character.follow("Nim", true);\n  character.follow("Nim", false);\n});\n',
      new Map(),
    );
    rt.fire({ type: 'event.onStart' }, true);
    expect(follows).toEqual(['Nim:true', 'Nim:false']);
  });
});

describe('My library', () => {
  const files = (o: Record<string, unknown>) => ({ get: (p: string) => o[p], has: (p: string) => p in o });
  const chr = {
    id: 'chr_aaaaaaaaaa',
    name: 'Mossling',
    profile: {},
    body: { plan: 'bpl_bbbbbbbbbb' },
    talk: [{ conversation: 'dlg_cccccccccc' }],
  };
  const game = files({
    'characters/chr_aaaaaaaaaa.json': chr,
    'bodyplans/bpl_bbbbbbbbbb.json': { id: 'bpl_bbbbbbbbbb', name: 'Moss body', bones: [] },
    'dialogue/dlg_cccccccccc.json': { id: 'dlg_cccccccccc', name: 'Hello' },
    'assets/ast_dddddddddd.json': { id: 'ast_dddddddddd', name: 'Rock' },
  });

  it('an item carries what it needs from its game (not the whole game)', () => {
    const it = gatherItem(game, 'character', 'chr_aaaaaaaaaa', { from: 'Moss Quest' })!;
    expect(it.name).toBe('Mossling');
    expect(Object.keys(it.files).sort()).toEqual([
      'bodyplans/bpl_bbbbbbbbbb.json',
      'characters/chr_aaaaaaaaaa.json',
      'dialogue/dlg_cccccccccc.json',
    ]);
  });

  it('brings in what a game is missing; a different thing under the same id comes in as a copy', () => {
    const it = gatherItem(game, 'character', 'chr_aaaaaaaaaa', { from: 'Moss Quest' })!;
    const empty = importCommands(files({}), it);
    expect(empty.commands).toHaveLength(3);
    expect(empty.copied).toBe(false);
    expect(importCommands(game, it).commands).toHaveLength(0);
    const clash = importCommands(files({ 'characters/chr_aaaaaaaaaa.json': { ...chr, name: 'Other' } }), it);
    expect(clash.copied).toBe(true);
    expect(clash.id).not.toBe('chr_aaaaaaaaaa');
    const main = clash.commands.find(
      (c) => (c.payload as { path: string }).path === `characters/${clash.id}.json`,
    )?.payload as { data: { name: string } };
    expect(main.data.name).toBe('Mossling (from library)');
  });

  it('a pack file round-trips; anything else is refused with a sentence', () => {
    const it = gatherItem(game, 'character', 'chr_aaaaaaaaaa', { from: 'Moss Quest' })!;
    expect(readPack(packText([it]))[0]!.name).toBe('Mossling');
    expect(() => readPack('nope')).toThrow(/not a library pack/);
    expect(() => readPack('{"format":"x"}')).toThrow(/not a Brick Worlds library pack/);
    // files outside the kinds a library carries are refused
    const bad = { ...it, files: { ...it.files, 'project.json': {} } };
    expect(() => readPack(packText([bad]))).toThrow(/nothing in it/);
  });
});
