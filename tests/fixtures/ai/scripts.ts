import { BUILTIN_ASSETS } from '../../../src/builtin/assets';
import { DEFAULT_EVENTS, DEFAULT_MIXER } from '../../../src/builtin/audio/pack';
import { BUILTIN_SCREENS } from '../../../src/builtin/screens';
import type { Scope } from '../../../src/core/ai/commands';
import type { FakeRound } from '../../../src/core/ai/fake';
import type { ProjectStore } from '../../../src/core/project/store';
import { type Character, type Gates, type MapDoc, paths, type Screen, type Widget } from '../../../src/core/schema';

/**
 * Scripted model transcripts for the six AI builder example requests (P8.2), plus a repair, a question
 * and a scope refusal. Each script is what a model does: read, describe, propose (sometimes wrongly),
 * then a one-line answer. They run through the real tools, validation and dry run.
 */
export type Script = { prompt: string; scope: Scope; rounds: FakeRound[]; expect: 'patch' | 'question' | 'failed' };

const entry = (s: ProjectStore) => s.get<MapDoc>(paths.map(s.manifest.entry.map))!;
const chest = BUILTIN_ASSETS.find((a) => a.name === 'Treasure chest')!;
const cheer = Object.keys(DEFAULT_EVENTS.events).find((k) => k.includes('cheer')) ?? Object.keys(DEFAULT_EVENTS.events)[0]!;
const hud = (s: ProjectStore): Screen =>
  structuredClone(s.get<Screen>(paths.screen('scr_hud0000000')) ?? BUILTIN_SCREENS.find((x) => x.kind === 'hud')!);
const say = (text: string): FakeRound => ({ text });

export const SCRIPTS: Record<string, (s: ProjectStore) => Script> = {
  'coin counter on the HUD': (s) => {
    const screen = hud(s);
    (screen.root.children ??= []).push({
      type: 'text',
      id: 'coins',
      anchor: [0, 0],
      offset: [24, 80],
      text: 'Coins: {coins}',
      style: { fontSize: 20, color: '#f7c900' },
    } satisfies Widget);
    return {
      prompt: 'Add a coin counter to the HUD',
      scope: 'screen',
      expect: 'patch',
      rounds: [
        { tools: [{ name: 'read_file', input: { path: 'builtin/screens/scr_hud0000000.json' } }] },
        {
          tools: [
            {
              name: 'propose_plan',
              input: {
                summary: 'Coin counter on the HUD',
                steps: [
                  { title: 'Add a coins variable', explain: 'Logic › Variables › + adds a number that starts at 0.', commands: [{ type: 'logic.setVariable', payload: { name: 'coins', def: { type: 'number', default: 0, scope: 'global' } } }] },
                  { title: 'Show it on the HUD', explain: 'Screens › HUD › Add widget › Text, then type Coins: {coins}.', commands: [{ type: 'screen.put', payload: { screen } }] },
                ],
              },
            },
          ],
        },
        say('The HUD now shows your coins in the top-left corner.'),
      ],
    };
  },

  'chest gives coins (with one repair)': (s) => {
    const code = (bad: boolean) =>
      `on("interact", { asset: "${chest.id}" }, (e) => {\n  vars.coins += 3;\n  audio.playSound("${cheer}")${bad ? '' : ';'}\n${bad ? '' : '});\n'}`;
    const plan = (bad: boolean) => ({
      summary: 'Chests give 3 coins and cheer',
      steps: [
        { title: 'Add a coins variable', explain: 'Logic › Variables.', commands: [{ type: 'logic.setVariable', payload: { name: 'coins', def: { type: 'number', default: 0, scope: 'global' } } }] },
        { title: 'Write the chest rule', explain: 'Logic › + New, Code view: on interact with the chest, add 3 coins and play a cheer.', commands: [{ type: 'logic.code', payload: { graph: 'lg_chestcoins', name: 'Chest coins', code: code(bad) } }] },
      ],
    });
    void s;
    return {
      prompt: 'Make every chest give 3 coins and play a cheer',
      scope: 'logic',
      expect: 'patch',
      rounds: [
        { tools: [{ name: 'describe_command', input: { type: 'logic.code' } }] },
        { tools: [{ name: 'propose_plan', input: plan(true) }] },
        { tools: [{ name: 'propose_plan', input: plan(false) }] },
        say('Chests now give 3 coins with a cheer.'),
      ],
    };
  },

  'second map with a gate': (s) => {
    const m = entry(s);
    return {
      prompt: 'Add a second map, a beach, and connect it with a gate',
      scope: 'map',
      expect: 'patch',
      rounds: [
        {
          tools: [
            {
              name: 'propose_plan',
              input: {
                summary: 'A beach map joined by a gate',
                steps: [
                  { title: 'Add a beach map', explain: 'World graph › + Add map, then Map tab › Generate with Beach.', commands: [{ type: 'map.create', payload: { id: 'map_beach00001', name: 'Sunny Beach', generate: { environments: ['beach'], size: 24, seed: 99 }, spawnId: 'sp_beach00001' } }] },
                  { title: 'Add a spawn by the road', explain: 'Scene › Spawn point tool (P), click near the start.', commands: [{ type: 'map.addSpawn', payload: { map: m.id, id: 'sp_toroad0001', name: 'To the beach', pos: [3.5, 0.4, 3.5], yaw: 0 } }] },
                  { title: 'Connect them with a gate', explain: 'World graph: drag from the new spawn port to the beach arrival.', commands: [{ type: 'gate.connect', payload: { id: 'gt_beach00001', from: { map: m.id, spawn: 'sp_toroad0001' }, to: { map: 'map_beach00001', spawn: 'sp_beach00001' }, twoWay: true } }] },
                ],
              },
            },
          ],
        },
        say('A beach map is connected to the start map by a two-way gate.'),
      ],
    };
  },

  'zone plays a reward scene': (s) => {
    const m = entry(s);
    const sp = m.spawns[0]!;
    const giver = s.manifest.hero ?? 'chr_aaaaaaaaaa';
    const [x, y, z] = sp.pos;
    return {
      prompt: 'When the hero reaches the start again, play a reward scene',
      scope: 'game',
      expect: 'patch',
      rounds: [
        { tools: [{ name: 'read_project_summary', input: {} }] },
        {
          tools: [
            {
              name: 'propose_plan',
              input: {
                summary: 'Reward scene at the start',
                steps: [
                  { title: 'Make a reward scene', explain: 'Cinematics › New reward scene.', commands: [{ type: 'cinematic.reward', payload: { id: 'cin_reward0001', map: m.id, at: [x, y, z], giver, line: 'You made it back!' } }] },
                  { title: 'Trigger it with a zone', explain: 'Scene › Trigger zone tool (Z), then On enter › Play cinematic.', commands: [{ type: 'map.addZone', payload: { map: m.id, zone: { id: 'zn_reward0001', min: [x - 2, 0, z - 2], max: [x + 2, 3, z + 2], onEnter: [{ do: 'cinematic', cinematic: 'cin_reward0001', once: true }] } } }] },
                ],
              },
            },
          ],
        },
        say('Walking into the zone at the start now plays the reward scene once.'),
      ],
    };
  },

  'quieter music on a rainy night': (s) => {
    const m = entry(s);
    return {
      prompt: 'Make it a rainy night and turn the music down',
      scope: 'game',
      expect: 'patch',
      rounds: [
        { tools: [{ name: 'read_file', input: { path: 'builtin/audio/mixer.json' } }] },
        {
          tools: [
            {
              name: 'propose_plan',
              input: {
                summary: 'Rainy night, quieter music',
                steps: [
                  { title: 'Rainy night', explain: 'Map tab › time Night and Rain.', commands: [{ type: 'map.setEnvironment', payload: { map: m.id, time: 'night', rain: true } }] },
                  { title: 'Turn the music down', explain: 'Audio › Mixer › Music fader.', commands: [{ type: 'audio.setMixer', payload: { base: s.get(paths.mixer) ?? DEFAULT_MIXER, buses: { music: -12 } } }] },
                ],
              },
            },
          ],
        },
        say('It is a rainy night now and the music is 12 dB quieter.'),
      ],
    };
  },

  'rename the hero': (s) => {
    const hero = s.get<Character>(paths.character(s.manifest.hero ?? ''));
    return {
      prompt: 'Call the hero Captain Brick',
      scope: 'character',
      expect: 'patch',
      rounds: [
        { tools: [{ name: 'read_file', input: { path: paths.character(s.manifest.hero ?? '') } }] },
        { tools: [{ name: 'propose_plan', input: { summary: 'Hero renamed', steps: [{ title: 'Rename the hero', explain: 'Characters › select the hero › Name.', commands: [{ type: 'character.update', payload: { character: { ...hero, name: 'Captain Brick' } } }] }] } }] },
        say('The hero is now called Captain Brick.'),
      ],
    };
  },

  'ambiguous request asks first': () => ({
    prompt: 'Make the game harder',
    scope: 'game',
    expect: 'question',
    rounds: [
      { tools: [{ name: 'ask_user', input: { question: 'Harder how?', options: ['Fewer hearts', 'More coins to find', 'Faster enemies'] } }] },
      say('Harder how: fewer hearts, more coins to find, or faster enemies?'),
    ],
  }),

  'outside the scope is refused': (s) => ({
    prompt: 'Put a red brick at the start',
    scope: 'logic',
    expect: 'failed',
    rounds: [
      { tools: [{ name: 'propose_plan', input: { summary: 'Red brick', steps: [{ title: 'Place a brick', explain: 'Brick paint.', commands: [{ type: 'bricks.place', payload: { map: s.manifest.entry.map, bricks: [{ type: 'brick2x2', x: 0, y: 0, z: 0, rot: 0, color: '#d20c20' }] } }] }] } }] },
      say('I can only change logic in this scope.'),
    ],
  }),
};

export const gatesOf = (s: ProjectStore) => s.get<Gates>(paths.gates)!;
