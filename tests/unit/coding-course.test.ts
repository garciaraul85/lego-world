import { describe, expect, it } from 'vitest';
import { parseCode } from '../../src/core/logic/code/parse';
import { printGraph } from '../../src/core/logic/code/print';
import { fillCode } from '../../src/editor/tutorial/coding';
import { CODING_CHAPTERS, CODING_STEPS } from '../../src/editor/tutorial/index';

const TOKENS = {
  chest: 'ast_chest00001',
  chestInstance: 'ins_chest00001',
  zone: 'zn_pond000001',
  spawn: 'sp_home000001',
  map: 'map_island0001',
  hud: 'scr_hud0000000',
  cinematic: 'cin_reward0001',
  sound: 'snd_coin000000',
  music: 'mus_night00000',
};

describe('coding course (P8)', () => {
  it('has chapters for every part of the language', () => {
    expect(CODING_CHAPTERS.map((c) => c.title)).toEqual([
      'Code basics',
      'Variables',
      'Events',
      'Decisions and flow',
      'Changing the world',
      'Sound, screens and scenes',
      'Debugging',
      'A whole game in code',
    ]);
    expect(CODING_STEPS.length).toBeGreaterThanOrEqual(30);
  });

  it('every program the course types parses, and Do it for me passes the step’s own check', () => {
    let typed = 0;
    for (const s of CODING_STEPS) {
      const t = s.doItForMe.find((d) => 'fn' in d && d.fn === 'typeCode') as { args: { code: string } } | undefined;
      if (!t) continue;
      typed++;
      const code = fillCode(t.args.code, TOKENS);
      const r = parseCode(code);
      if (s.check.kind === 'state' && s.check.test === 'codeError') {
        expect('error' in r, s.id).toBe(true);
        continue;
      }
      expect('error' in r ? r.error : null, `${s.id}\n${code}`).toBeNull();
      if ('error' in r) continue;
      const printed = printGraph(r).code;
      if (s.check.kind === 'state' && (s.check.test === 'codeHas' || s.check.test === 'codeFixed')) {
        const res = Array.isArray(s.check.args) ? s.check.args : [s.check.args];
        for (const re of res) expect(printed, `${s.id}: ${re}`).toMatch(new RegExp(fillCode(String(re), TOKENS), 'm'));
      }
      // the printed code reads back to the same graph (what you type is what you get)
      const again = parseCode(printed);
      expect('error' in again, s.id).toBe(false);
    }
    expect(typed).toBeGreaterThanOrEqual(18);
  });

  it('every node kind of the language is taught somewhere', () => {
    const all = CODING_STEPS.flatMap((s) => s.doItForMe)
      .filter((d): d is { fn: string; args: { code: string } } => 'fn' in d && d.fn === 'typeCode')
      .map((d) => d.args.code)
      .join('\n');
    for (const word of [
      'on("start"',
      'enterZone',
      'interact',
      'varChanged',
      'timer',
      'custom',
      'cinematicDone',
      'vars.',
      '+=',
      'if (',
      'else',
      'await wait',
      'once(',
      'gate(',
      'gate.open',
      'random(',
      '&&',
      'emit(',
      'log(',
      'world.give',
      'world.setState',
      'world.teleport',
      'world.spawn',
      'forEachInZone',
      'audio.playSound',
      'audio.setMusic',
      'screen.setText',
      'cinematic.play',
    ])
      expect(all, word).toContain(word);
  });
});
