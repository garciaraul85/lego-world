import { describe, expect, it } from 'vitest';
import type { Conversation } from '../../src/core/dialogue/schema';
import type { Action } from '../../src/core/schema';
import { TalkSystem, type TalkSystemHost } from '../../src/engine/runtime/talk';

/** P22 part 1: conversations in Play — lines, choices, conditions, actions, talks and likes. */
const SMITH: Conversation = {
  id: 'dlg_smith00001',
  name: 'Blacksmith',
  sections: [
    {
      label: 'start',
      steps: [
        { k: 'line', who: 'chr_smith00001', text: 'Back again, {hero.name}?', if: 'talks > 0' },
        { k: 'line', who: 'chr_smith00001', text: 'A fine sword, only 50 gems.' },
        {
          k: 'choice',
          options: [
            { text: 'Buy it', to: 'buy', if: 'gems >= 50', failed: 'grey' },
            { text: 'Secret', to: 'buy', if: 'likes > 50' },
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
      ],
    },
  ],
};

function world(convs: Conversation[] = [SMITH]) {
  const vars = new Map<string, unknown>([['gems', 60]]);
  const inventory = new Map<string, number>();
  const fired: string[] = [];
  let t = 0;
  const run = (actions: Action[]) => {
    for (const a of actions) {
      if (a.do === 'addVar') vars.set(a.var, Number(vars.get(a.var) ?? 0) + a.value);
      if (a.do === 'give') inventory.set(a.item, (inventory.get(a.item) ?? 0) + (a.count ?? 1));
    }
  };
  const host: TalkSystemHost = {
    get: (p) =>
      convs.find((c) => p === `dialogue/${c.id}.json`) ??
      (p === 'characters/chr_smith00001.json'
        ? { id: 'chr_smith00001', name: 'Smith', nameColor: '#ff8800' }
        : undefined),
    project: { dialogue: { textSpeed: 20 } },
    genre: null,
    vars,
    setVar: (n, v) => vars.set(n, v),
    inventory,
    run,
    text: (s) => s.replace('{hero.name}', 'Ava'),
    timeOfDay: () => 'day',
    objectState: () => undefined,
    fire: (type, m) => fired.push(`${type}:${m.option ?? m.conversation}`),
    log: () => {},
    say: () => {},
    now: () => t,
  };
  return { talks: new TalkSystem(host), vars, inventory, fired, tick: (s: number) => (t += s) };
}

describe('conversations in Play', () => {
  it('plays lines, skips ones whose condition fails, shows choices, runs actions, counts talks and likes', () => {
    const { talks, vars, inventory, fired, tick } = world();
    expect(talks.start('dlg_smith00001', { talker: 'chr_smith00001', from: 'npc' })).toBe(true);
    // the first meeting: “Back again” (talks > 0) is skipped
    expect(talks.view).toMatchObject({
      speakerName: 'Smith',
      nameColor: '#ff8800',
      text: 'A fine sword, only 50 gems.',
    });
    expect(vars.get('talks.chr_smith00001')).toBe(1);
    // letter by letter: next first shows the whole line, then moves on
    expect(talks.revealed()).toBe(0);
    tick(0.5);
    expect(talks.revealed()).toBe(10);
    talks.next();
    expect(talks.complete).toBe(true);
    talks.next();
    // the choice: Secret is hidden (likes 0), Buy is enabled (60 gems)
    expect(talks.view?.choices?.map((c) => [c.text, c.enabled])).toEqual([
      ['Buy it', true],
      ['Not now', true],
    ]);
    talks.move(1);
    expect(talks.focus).toBe(1);
    talks.move(1);
    talks.next(); // picks Buy it (focus wrapped to 0)
    expect(fired).toContain('event.onChoice:Buy it');
    expect(vars.get('gems')).toBe(10);
    expect(inventory.get('sword')).toBe(1);
    expect(vars.get('likes.chr_smith00001')).toBe(10);
    expect(talks.view).toMatchObject({ who: '', text: 'The smith hands you the sword.' });
    talks.next();
    talks.next();
    expect(talks.active).toBe(false);
    expect(fired).toContain('event.onConversationEnd:dlg_smith00001');
  });

  it('the second time: “Back again”, and Buy is greyed out without the gems', () => {
    const { talks, vars } = world();
    vars.set('talks.chr_smith00001', 1);
    vars.set('gems', 5);
    talks.start('dlg_smith00001', { talker: 'chr_smith00001' });
    expect(talks.view?.text).toBe('Back again, Ava?');
    talks.next();
    talks.next();
    talks.next();
    talks.next();
    expect(talks.view?.choices?.map((c) => c.enabled)).toEqual([false, true]);
    talks.choose(0); // greyed: nothing happens
    expect(talks.view?.choices).toBeTruthy();
    talks.choose(1); // Not now -> end
    expect(talks.active).toBe(false);
  });

  it('picks a character’s conversation by condition; signs read in the Sign style', () => {
    const after: Conversation = {
      ...SMITH,
      id: 'dlg_after00001',
      name: 'After',
      sections: [{ label: 'start', steps: [{ k: 'line', who: '', text: 'Thanks again!' }] }],
    };
    const { talks, vars } = world([SMITH, after]);
    const chr = {
      id: 'chr_smith00001',
      talk: [{ conversation: 'dlg_after00001', if: 'quest.sword is done' }, { conversation: 'dlg_smith00001' }],
    };
    expect(talks.pick(chr)).toBe('dlg_smith00001');
    vars.set('quest.sword', 'done');
    expect(talks.pick(chr)).toBe('dlg_after00001');
    talks.start('dlg_after00001', { from: 'sign' });
    expect(talks.view?.look.style).toBe('sign');
    talks.start('dlg_smith00001', { from: 'npc' });
    expect(talks.view?.look.style).toBe('adventure');
  });

  it('a loop of jumps with no line ends instead of hanging; barks wait between lines', () => {
    const loop: Conversation = {
      id: 'dlg_loop000001',
      name: 'Loop',
      sections: [
        { label: 'start', steps: [{ k: 'goto', to: 'b' }] },
        { label: 'b', steps: [{ k: 'goto', to: 'start' }] },
      ],
    };
    const { talks } = world([loop]);
    expect(talks.start('dlg_loop000001')).toBe(false);
    const chr = { id: 'chr_x', name: 'Tom', barks: [{ text: 'Watch your step!' }] };
    expect(talks.bark(chr, 0)).toBe('Tom: Watch your step!');
    expect(talks.bark(chr, 3)).toBeNull();
    expect(talks.bark(chr, 9)).toBe('Tom: Watch your step!');
  });
});
