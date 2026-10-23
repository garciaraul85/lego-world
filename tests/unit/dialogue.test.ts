import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPlayable } from '../../src/core/checks/playable';
import { CommandBus, registerAll } from '../../src/core/commands';
import { checkConversation, lookOf } from '../../src/core/dialogue/checks';
import { type CondHost, checkCondition, conditionNames, evalCondition } from '../../src/core/dialogue/condition';
import { type Conversation, Conversation as ConversationSchema } from '../../src/core/dialogue/schema';
import { parseScript, printScript } from '../../src/core/dialogue/script';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import { fileKindOf, paths } from '../../src/core/schema';

/** P22 part 1: conversations — the condition language, the script view, checks and commands. */
const host = (vars: Record<string, unknown>, items: Record<string, number> = {}, r = 0.5): CondHost => ({
  value: (n) => vars[n],
  count: (i) => items[i] ?? 0,
  random: () => r,
});

describe('conditions', () => {
  it('reads like a sentence', () => {
    const h = host({ gems: 60, 'quest.sword': 'done', talks: 2, likes: 25, time: 'night' }, { key: 1 });
    expect(evalCondition('gems >= 50', h)).toBe(true);
    expect(evalCondition('gems < 50', h)).toBe(false);
    expect(evalCondition('quest.sword is done', h)).toBe(true);
    expect(evalCondition('quest.sword is not done', h)).toBe(false);
    expect(evalCondition('talks > 0 and has key', h)).toBe(true);
    expect(evalCondition('not has key or likes >= 20', h)).toBe(true);
    expect(evalCondition('(gems = 60) and time is night', h)).toBe(true);
    expect(evalCondition('has 2 key', h)).toBe(false);
    expect(evalCondition('chance 25%', h)).toBe(false);
    expect(evalCondition('chance 75%', h)).toBe(true);
    expect(evalCondition('', h)).toBe(true);
    // unknown values are empty: a typo is false, not an error
    expect(evalCondition('gemz >= 1', h)).toBe(false);
    expect(evalCondition('name is "Old Tom"', host({ name: 'old tom' }))).toBe(true);
  });

  it('explains mistakes and lists the names it reads', () => {
    expect(checkCondition('gems >=')).toMatch(/missing/);
    expect(checkCondition('(gems > 1')).toMatch(/bracket/);
    expect(checkCondition('has')).toMatch(/item name/);
    expect(checkCondition('gems >= 50 and talks > 0')).toBeNull();
    expect(evalCondition('gems >=', host({ gems: 9 }))).toBe(false);
    expect(conditionNames('gems >= 50 and not has key or quest.a is done')).toEqual(['gems', 'has key', 'quest.a']);
  });
});

const SMITH: Conversation = {
  id: 'dlg_smith00001',
  name: 'Blacksmith',
  sections: [
    {
      label: 'start',
      steps: [
        { k: 'line', who: 'chr_smith00001', text: 'Back again, hero?', mood: 'happy', if: 'quest.sword is done' },
        { k: 'line', who: 'chr_smith00001', text: 'A fine sword, only 50 gems.' },
        {
          k: 'choice',
          options: [
            { text: 'Buy it', to: 'buy', if: 'gems >= 50', failed: 'grey' },
            { text: 'Not now', to: 'end' },
          ],
        },
      ],
    },
    {
      label: 'buy',
      steps: [
        {
          k: 'do',
          actions: [
            { do: 'addVar', var: 'gems', value: -50 },
            { do: 'give', item: 'sword' },
          ],
        },
        { k: 'like', by: 10 },
        { k: 'line', who: '', text: 'The smith hands you the sword.' },
        { k: 'goto', to: 'end' },
      ],
    },
  ],
};
const names = {
  nameOf: (w: string) => (w === 'chr_smith00001' ? 'Smith' : w),
  whoOf: (n: string) => (n === 'Smith' ? 'chr_smith00001' : n),
};

describe('script view', () => {
  it('prints the way writers write, and reads back to the same conversation', () => {
    const text = printScript(SMITH, names);
    expect(text).toContain('== start');
    expect(text).toContain('[if quest.sword is done] Smith (happy): Back again, hero?');
    expect(text).toContain('* Buy it [if gems >= 50] [grey] -> buy');
    expect(text).toContain('> add gems -50');
    expect(text).toContain('> like +10');
    expect(text).toContain('Narrator: The smith hands you the sword.');
    const back = parseScript(text, SMITH, names);
    expect(back.errors).toEqual([]);
    expect(back.conversation).toEqual(SMITH);
    expect(ConversationSchema.safeParse(back.conversation).success).toBe(true);
  });

  it('reports mistakes by line and keeps the rest', () => {
    const r = parseScript('== start\nTom: Hi\n> fly away\n* \n[if gems >] Tom: Rich?\n== Bad Name\n-> nowhere!', SMITH);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7]);
    expect(r.conversation.sections[0]!.steps[0]).toEqual({ k: 'line', who: 'Tom', text: 'Hi' });
    // a line with no name is the narrator
    expect(parseScript('It is raining.', SMITH).conversation.sections[0]!.steps[0]).toMatchObject({
      who: '',
      text: 'It is raining.',
    });
  });
});

describe('checks and commands', () => {
  it('finds missing sections, unreachable ones, bad conditions and deleted speakers', () => {
    const bad: Conversation = {
      ...SMITH,
      sections: [
        {
          label: 'start',
          steps: [
            { k: 'goto', to: 'shop' },
            { k: 'line', who: 'chr_gone000001', text: 'Hi', if: 'x >' },
          ],
        },
        { label: 'lost', steps: [] },
      ],
    };
    const issues = checkConversation(bad, { character: () => false, file: () => true }).map((i) => i.message);
    expect(issues).toEqual(
      expect.arrayContaining([
        'There is no section “shop”.',
        'This line’s speaker was deleted.',
        expect.stringMatching(/^Condition:/),
        'Nothing jumps to “lost”, so it never plays.',
        '“lost” is empty.',
      ]),
    );
    expect(checkConversation(SMITH, { character: () => true, file: () => true })).toEqual([]);
  });

  it('dialogue.put saves a conversation file; one in use cannot be deleted', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'D', mapName: 'M' }));
    const bus = registerAll(new CommandBus(store));
    const exec = (c: { type: string; payload: unknown }) => bus.execute(c as never, { source: 'user' });
    const c = { ...SMITH, sections: SMITH.sections.map((s) => ({ ...s })) };
    expect(fileKindOf(paths.dialogue(c.id))).toBe('dialogue');
    const put = exec({ type: 'dialogue.put', payload: { conversation: c } });
    expect(put.ok, JSON.stringify(put)).toBe(true);
    expect(store.has('dialogue/dlg_smith00001.json')).toBe(true);
    const twice = { ...c, sections: [c.sections[0]!, { ...c.sections[0]! }] };
    expect(exec({ type: 'dialogue.put', payload: { conversation: twice } }).error).toMatch(/Two sections/);
    // a character talks with it: the conversation stays
    const ch = (
      JSON.parse(readFileSync('tests/fixtures/schema/character.valid.json', 'utf8')) as { value: { id: string } }
    ).value;
    store.put(paths.character(ch.id), ch);
    const upd = exec({ type: 'character.update', payload: { character: { ...ch, talk: [{ conversation: c.id }] } } });
    expect(upd.ok, upd.error).toBe(true);
    expect(exec({ type: 'dialogue.delete', payload: { id: c.id } }).error).toMatch(/Still used by/);
    expect(
      exec({
        type: 'character.update',
        payload: { character: { ...ch, talk: [{ conversation: 'dlg_nothere001' }] } },
      }).error,
    ).toMatch(/does not exist/);
  });

  it('the look: defaults, then the genre’s, the game’s and the conversation’s own style', () => {
    expect(lookOf(null, null).style).toBe('adventure');
    expect(lookOf({ dialogue: { style: 'rpg', textSpeed: 0 } }, { dialogue: { style: 'chat' } }).style).toBe('rpg');
    expect(lookOf({ dialogue: { textSpeed: 0 } }, { dialogue: { style: 'chat' } }, 'sign')).toMatchObject({
      style: 'sign',
      textSpeed: 0,
    });
  });

  it('“Can this game be finished?” lists broken conversations and ones nothing starts', () => {
    const store = new ProjectStore(newProjectFiles({ name: 'D', mapName: 'M' }));
    const bus = registerAll(new CommandBus(store));
    const broken = {
      ...SMITH,
      id: 'dlg_broken0001',
      sections: [{ label: 'start', steps: [{ k: 'goto' as const, to: 'nowhere' }] }],
    };
    bus.execute({ type: 'dialogue.put', payload: { conversation: broken } } as never, { source: 'user' });
    const issues = checkPlayable(store).filter((i) => i.conversation === 'dlg_broken0001');
    expect(issues.map((i) => i.code).sort()).toEqual(['dialogueBroken', 'dialogueUnused']);
    expect(issues.find((i) => i.code === 'dialogueBroken')!.message).toMatch(/no section “nowhere”/);
  });
});
