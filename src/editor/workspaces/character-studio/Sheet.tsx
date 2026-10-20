import { useEffect, useRef, useState } from 'preact/hooks';
import { BUILTIN_CLIPS } from '../../../builtin/clips';
import {
  ANIM_ACTIONS,
  ANIM_LIVE,
  type AnimAction,
  BEHAVIOUR_INFO,
  BEHAVIOURS,
  type Behaviour,
  DEFAULT_STATS,
  MOVE_STYLES,
  type Moves,
  type Outfit,
  STYLE_MOVES,
  type Stats,
  xpFor,
} from '../../../core/character/sheet';
import { lookOf } from '../../../core/dialogue/checks';
import { mouthAt } from '../../../core/dialogue/lipsync';
import type { Character, Clip } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { FieldHelp } from '../../components/fields';
import { viewGenre } from '../../genres/view';
import { soundOptions } from '../../panels/AudioFields';
import { ClipThumb } from './thumbs';

/**
 * P22 part 2: the character sheet's tabs — Outfits, Stats, Moves, Animations, Voice and Behaviour (Look
 * and Dialogue live in the studio and the Talk section). Each edit is one character.update, one undo step.
 */
export type SheetTab =
  | 'look'
  | 'body'
  | 'face'
  | 'outfits'
  | 'stats'
  | 'moves'
  | 'animations'
  | 'voice'
  | 'dialogue'
  | 'behaviour';
export const SHEET_TABS: [SheetTab, string][] = [
  ['look', 'Look'],
  ['body', 'Body'],
  ['face', 'Face'],
  ['outfits', 'Outfits'],
  ['stats', 'Stats'],
  ['moves', 'Moves'],
  ['animations', 'Animations'],
  ['voice', 'Voice'],
  ['dialogue', 'Dialogue'],
  ['behaviour', 'Behaviour'],
];

export const SHEET_HELP: Record<Exclude<SheetTab, 'look' | 'dialogue'>, string> = {
  face: 'The resting face and a face for each mood. A dialogue line’s mood shows that face on the speaker in Play and in its portrait.',
  body: 'What the character is made of: the minifig, or a body family (four legs, bird, fish, serpent, spider, insect, slime, dragon, robot walker) shaped with sliders, or a skeleton of your own (Custom…: start from any family’s skeleton, then add, move and remove bones). Bodies move by themselves: legs step, wings flap, spines snake. A brick build from the Asset studio can be worn on the skeleton.',
  outfits:
    'Outfits are sets of clothes the character can wear: each keeps the look parts that differ (hat, shirt, colours…) and can change its stats. Logic’s Change outfit (or the action) swaps them in Play.',
  stats:
    'How strong, fast and tough the character is. For the player character: hearts, stamina, speed, jump, strength (hit power), defence (each point takes 8% off damage) and its level with how much experience levels need (Give experience).',
  moves:
    'How it fights: a style sets hit power and swing speed (fine-tune them below); the held item and the off hand (Look › Gear) decide the weapon. For a neighbour, “Fights the hero” makes it an enemy.',
  animations:
    'The clip played for each action. Idle plays after standing still a moment, Victory on a level up, Hurt when hit. Walk, run, jump and attack are kept for the animation state machine (P23); until then the built-in motion plays.',
  voice:
    'How it sounds: the voice blip and pitch of its lines in dialogue, its footsteps and the grunt when it is hurt (the player character).',
  behaviour:
    'What kind of character it is and what it does on its own: walks around, or stands where it was put (a shopkeeper at a counter). Party: playable heroes the player switches between with H.',
};

export type Props = { c: ActionCtx; chr: Character; save: (next: Character, label: string) => void };

export const num = (v: string, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

export function NumField({
  label,
  value,
  lo,
  hi,
  step = 1,
  onCommit,
  help,
}: {
  label: string;
  value: number;
  lo: number;
  hi: number;
  step?: number;
  onCommit: (v: number) => void;
  help?: string;
}) {
  return (
    <label class="field">
      <span>
        {label}
        {help && <FieldHelp label={label} text={help} />}
      </span>
      <input
        class="inp mono"
        type="number"
        aria-label={label}
        min={lo}
        max={hi}
        step={step}
        // uncontrolled: a redraw while typing (another field saved) must not put the old number back
        key={String(value)}
        defaultValue={String(value)}
        onChange={(e) => {
          const n = num((e.target as HTMLInputElement).value, lo, hi);
          if (n !== null) onCommit(step < 1 ? Math.round(n * 100) / 100 : Math.round(n));
        }}
      />
    </label>
  );
}

export function OutfitsTab({ chr, save }: Props) {
  const outfits = chr.outfits ?? [];
  const setOutfits = (next: Outfit[], label: string) => save({ ...chr, outfits: next }, label);
  return (
    <div class="sec" data-tour="char-outfits" data-help="characters.outfits">
      <div class="sech">
        <span>
          Outfits
          <FieldHelp label="Outfits" text={SHEET_HELP.outfits} />
        </span>
      </div>
      <p class="muted small">
        Wear an outfit, then change the look (Look tab): the changes go into the outfit, and the character’s own look
        stays as it was.
      </p>
      {outfits.map((o, i) => {
        const worn = chr.outfit === o.name;
        return (
          <div class={`outfit-row ${worn ? 'on' : ''}`}>
            <input
              class="inp"
              aria-label="Outfit name"
              value={o.name}
              onChange={(e) => {
                const name = (e.target as HTMLInputElement).value.trim().slice(0, 40);
                if (!name || outfits.some((x, j) => j !== i && x.name === name)) return;
                save(
                  {
                    ...chr,
                    outfits: outfits.map((x, j) => (j === i ? { ...x, name } : x)),
                    ...(worn ? { outfit: name } : {}),
                  },
                  'Rename outfit',
                );
              }}
            />
            <span class="muted small">{Object.keys(o.look).length} parts</span>
            <button
              type="button"
              class={`btn small ${worn ? 'on' : ''}`}
              aria-pressed={worn}
              onClick={() => {
                if (worn) {
                  const { outfit: _o, ...rest } = chr;
                  save(rest as Character, 'Own clothes');
                } else save({ ...chr, outfit: o.name }, `Wear ${o.name}`);
              }}
            >
              {worn ? 'Worn' : 'Wear'}
            </button>
            <button
              type="button"
              class="btn icon"
              aria-label={`Remove outfit ${o.name}`}
              onClick={() => {
                const { outfit: _o, ...rest } = chr;
                save(
                  { ...(worn ? (rest as Character) : chr), outfits: outfits.filter((_, j) => j !== i) },
                  'Remove outfit',
                );
              }}
            >
              ×
            </button>
            <div class="grid4">
              {(['speed', 'jump', 'strength', 'defence'] as const).map((k) => (
                <NumField
                  label={`${k} ±`}
                  value={o.stats?.[k] ?? 0}
                  lo={k === 'defence' ? -10 : -2}
                  hi={k === 'defence' ? 10 : 2}
                  step={k === 'defence' ? 1 : 0.1}
                  onCommit={(v) =>
                    setOutfits(
                      outfits.map((x, j) => (j === i ? { ...x, stats: { ...(x.stats ?? {}), [k]: v } } : x)),
                      'Outfit stats',
                    )
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
      {outfits.length < 8 && (
        <button
          type="button"
          class="btn"
          data-tour="outfit-new"
          onClick={() => {
            const n = outfits.length + 1;
            const name = n === 1 ? 'Armour' : `Outfit ${n}`;
            setOutfits([...outfits, { name, look: {} }], 'New outfit');
          }}
        >
          + New outfit
        </button>
      )}
    </div>
  );
}

export function StatsTab({ c, chr, save, isHero }: Props & { isHero: boolean }) {
  const full = viewGenre(c.ed).features === 'all' || (viewGenre(c.ed).features as readonly string[]).includes('combat');
  const st: Stats = { ...DEFAULT_STATS, ...(chr.stats ?? {}) };
  // the latest saved character: two numbers changed quickly (Tab, Tab) must not undo each other
  const set = (k: keyof Stats, v: Stats[keyof Stats]) => {
    const cur = (c.ed.store.get(`characters/${chr.id}.json`) as Character | undefined) ?? chr;
    save({ ...cur, stats: { ...DEFAULT_STATS, ...(cur.stats ?? {}), [k]: v } }, `${k}`);
  };
  return (
    <div class="sec" data-tour="char-stats" data-help="characters.stats">
      <div class="sech">
        <span>
          Stats
          <FieldHelp label="Stats" text={SHEET_HELP.stats} />
        </span>
        {chr.stats && (
          <button
            type="button"
            class="link"
            onClick={() => {
              const { stats: _s, ...rest } = chr;
              save(rest as Character, 'Default stats');
            }}
          >
            Defaults
          </button>
        )}
      </div>
      {!chr.stats && <p class="muted small">Using the defaults. Change any number to give {chr.name} its own.</p>}
      <div class="grid2">
        {isHero && <NumField label="Hearts" value={st.health} lo={1} hi={99} onCommit={(v) => set('health', v)} />}
        <NumField label="Speed" value={st.speed} lo={0.5} hi={2} step={0.05} onCommit={(v) => set('speed', v)} />
        <NumField label="Jump" value={st.jump} lo={0.5} hi={2} step={0.05} onCommit={(v) => set('jump', v)} />
        {full && <NumField label="Stamina" value={st.stamina} lo={10} hi={500} onCommit={(v) => set('stamina', v)} />}
        {full && (
          <NumField
            label="Strength"
            value={st.strength}
            lo={0.5}
            hi={3}
            step={0.05}
            onCommit={(v) => set('strength', v)}
          />
        )}
        {full && <NumField label="Defence" value={st.defence} lo={0} hi={10} onCommit={(v) => set('defence', v)} />}
        <NumField label="Level" value={st.level} lo={1} hi={99} onCommit={(v) => set('level', v)} />
        <label class="field">
          Experience curve
          <select
            class="inp"
            aria-label="Experience curve"
            value={st.xpCurve}
            onChange={(e) => set('xpCurve', (e.target as HTMLSelectElement).value as Stats['xpCurve'])}
          >
            <option value="fast">Fast</option>
            <option value="normal">Normal</option>
            <option value="slow">Slow</option>
          </select>
        </label>
      </div>
      <p class="muted small">
        Level {st.level + 1} needs {xpFor(st.level + 1, st.xpCurve)} experience, level {st.level + 5} needs{' '}
        {xpFor(st.level + 5, st.xpCurve)}.
        {!full && ' (The genre’s simple view; Open shows stamina, strength and defence.)'}
      </p>
    </div>
  );
}

export function MovesTab({ chr, save }: Props) {
  const m: Moves = chr.moves ?? { style: 'balanced', power: 1, speed: 1 };
  const set = (next: Partial<Moves>, label: string) => save({ ...chr, moves: { ...m, ...next } }, label);
  return (
    <div class="sec" data-tour="char-moves" data-help="characters.moves">
      <div class="sech">
        <span>
          Fighting style
          <FieldHelp label="Fighting style" text={SHEET_HELP.moves} />
        </span>
      </div>
      <div class="seg wrap" role="radiogroup" aria-label="Fighting style">
        {MOVE_STYLES.map((s) => (
          <button
            type="button"
            role="radio"
            aria-checked={m.style === s}
            class={`btn small ${m.style === s ? 'on' : ''}`}
            title={STYLE_MOVES[s].about}
            onClick={() => set({ style: s }, `Style: ${STYLE_MOVES[s].label}`)}
          >
            {STYLE_MOVES[s].label}
          </button>
        ))}
      </div>
      <p class="muted small">{STYLE_MOVES[m.style].about}.</p>
      <div class="grid2">
        <NumField
          label="Hit power ×"
          value={m.power}
          lo={0.5}
          hi={3}
          step={0.05}
          onCommit={(v) => set({ power: v }, 'Hit power')}
        />
        <NumField
          label="Swing speed ×"
          value={m.speed}
          lo={0.5}
          hi={2}
          step={0.05}
          onCommit={(v) => set({ speed: v }, 'Swing speed')}
        />
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<AnimAction, string> = {
  idle: 'Idle (standing still)',
  victory: 'Victory (level up)',
  hurt: 'Hurt (when hit)',
  walk: 'Walk',
  run: 'Run',
  jump: 'Jump',
  attack: 'Attack',
};

export function AnimationsTab({ c, chr, save }: Props) {
  const own = c.ed.store
    .list('clips/')
    .map((p) => c.ed.store.get<Clip>(p)!)
    .filter(Boolean);
  const clips = [...own, ...BUILTIN_CLIPS];
  const anims = chr.animations ?? {};
  return (
    <div class="sec" data-tour="char-animations" data-help="characters.animations">
      <div class="sech">
        <span>
          Animations
          <FieldHelp label="Animations" text={SHEET_HELP.animations} />
        </span>
      </div>
      {ANIM_ACTIONS.map((a) => {
        const picked = anims[a] ? clips.find((x) => x.id === anims[a]) : undefined;
        const showing = !!picked && c.ed.studioClip.value === picked.id && c.ed.clipPlaying.value;
        return (
          <div class="field anim-row" data-tour={`anim-${a}`}>
            <span>
              {ACTION_LABEL[a]}
              {!ANIM_LIVE.includes(a) && <span class="chip small">P23</span>}
            </span>
            <span class="row" style={{ flexWrap: 'nowrap', gap: '6px' }}>
              {picked ? (
                <ClipThumb profile={chr.profile} clip={picked} size={26} play={showing} />
              ) : (
                <span class="clip-thumb none" aria-hidden="true" />
              )}
              <select
                class="inp"
                aria-label={`${ACTION_LABEL[a]} clip`}
                value={anims[a] ?? ''}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  const next = { ...anims };
                  if (v) next[a] = v as Clip['id'];
                  else delete next[a];
                  save({ ...chr, animations: next }, `${a} clip`);
                  if (v) playOnFigure(c, v);
                }}
              >
                <option value="">Built-in motion</option>
                {clips.map((x) => (
                  <option value={x.id}>
                    {x.name ?? x.id}
                    {own.includes(x) ? ' (mine)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                class={`btn icon ${showing ? 'on' : ''}`}
                aria-label={`Preview the ${ACTION_LABEL[a].toLowerCase()} clip`}
                data-tip={
                  picked
                    ? `Play ${picked.name ?? 'the clip'} on the figure (again to stop)`
                    : 'The built-in motion plays in the game; pick a clip to preview it here'
                }
                disabled={!picked}
                onClick={() => {
                  if (showing) c.ed.clipPlaying.value = false;
                  else playOnFigure(c, picked!.id);
                }}
              >
                {showing ? '■' : '▶'}
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** P23: play a clip on the big figure in the middle, from its start (the timeline below shows it too) */
export function playOnFigure(c: Props['c'], clip: string) {
  c.ed.studioClip.value = clip;
  c.ed.clipTime.value = 0;
  c.ed.clipPlaying.value = true;
}

/** a line the Voice tab's preview says */
const SAMPLE_LINE = 'Hello there! Lovely day for building, isn’t it?';

export function VoiceTab({ c, chr, save }: Props) {
  const v = chr.voice ?? { pitch: 1 };
  const sounds = soundOptions(c.ed);
  const set = (next: Partial<NonNullable<Character['voice']>>, label: string) => {
    const merged: Record<string, unknown> = { ...v, ...next };
    for (const k of Object.keys(merged)) if (merged[k] === '' || merged[k] === undefined) delete merged[k];
    save({ ...chr, voice: merged as NonNullable<Character['voice']> }, label);
  };
  const pick = (k: 'blip' | 'footsteps' | 'grunt', label: string, none: string) => (
    <label class="field">
      {label}
      <span class="row">
        <select
          class="inp"
          aria-label={label}
          value={v[k] ?? ''}
          onChange={(e) => set({ [k]: (e.target as HTMLSelectElement).value || undefined }, label)}
        >
          <option value="">{none}</option>
          {sounds.map((s) => (
            <option value={s.id}>{s.name}</option>
          ))}
        </select>
        {v[k] && (
          <button
            type="button"
            class="btn icon"
            aria-label={`Listen to ${label}`}
            onClick={() => c.ed.audio.previewEvent(v[k]!, k === 'blip' ? v.pitch : undefined)}
          >
            ▶
          </button>
        )}
      </span>
    </label>
  );
  return (
    <div class="sec" data-tour="char-voice" data-help="characters.voice">
      <div class="sech">
        <span>
          Voice and sounds
          <FieldHelp label="Voice" text={SHEET_HELP.voice} />
        </span>
      </div>
      <label class="field">
        Talk pitch {v.pitch.toFixed(1)} ({v.pitch < 0.8 ? 'deep' : v.pitch > 1.3 ? 'high' : 'middle'})
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          aria-label="Talk pitch"
          value={v.pitch}
          onChange={(e) => set({ pitch: Number((e.target as HTMLInputElement).value) }, 'Talk pitch')}
        />
      </label>
      <VoicePreview c={c} chr={chr} />
      {pick('blip', 'Voice blip', 'The game’s')}
      {pick('footsteps', 'Footsteps', 'Built-in steps')}
      {pick('grunt', 'Hurt sound', 'Built-in')}
    </div>
  );
}

/**
 * P23: hear the voice. The sample line appears letter by letter as it does in a conversation, with a blip
 * every couple of letters at the voice's pitch (its own blip, or the game's dialogue blip).
 */
export function VoicePreview({ c, chr }: Pick<Props, 'c' | 'chr'>) {
  const [shown, setShown] = useState(-1);
  const timer = useRef(0);
  useEffect(
    () => () => {
      clearInterval(timer.current);
      c.ed.talkMouth.value = 0;
    },
    [],
  );
  const look = lookOf(c.ed.store.manifest, null);
  const blip = chr.voice?.blip ?? look.blip;
  const pitch = chr.voice?.pitch ?? 1;
  const speed = Math.max(20, look.textSpeed || 40);
  const play = () => {
    clearInterval(timer.current);
    let n = 0;
    setShown(0);
    c.ed.talkHeard.value++;
    timer.current = window.setInterval(() => {
      n++;
      setShown(n);
      // P23 part 3: the figure in the preview says it (lip sync)
      c.ed.talkMouth.value = mouthAt(SAMPLE_LINE, n);
      if (blip && n % 2 === 0 && /\S/.test(SAMPLE_LINE[n - 1] ?? '')) c.ed.audio.previewEvent(blip, pitch);
      if (n >= SAMPLE_LINE.length) {
        clearInterval(timer.current);
        c.ed.talkMouth.value = 0;
        window.setTimeout(() => setShown(-1), 1500);
      }
    }, 1000 / speed);
  };
  return (
    <div class="voice-preview">
      <button type="button" class="btn" data-tour="voice-hear" onClick={play}>
        ▶ Hear it talk
      </button>
      {shown >= 0 && (
        <p class="voice-line" role="status" aria-label="Voice preview">
          <b>{chr.name || 'Them'}:</b> {SAMPLE_LINE.slice(0, shown)}
        </p>
      )}
      {!blip && <p class="muted small">No blip: this game's conversations are silent (Project › Dialogue).</p>}
    </div>
  );
}

/** Starting points for a sheet: stats, moves and behaviour that suit a kind of character. */
export const ROLE_PRESETS: { name: string; behaviour: Behaviour; stats: Partial<Stats>; moves?: Moves }[] = [
  {
    name: 'Knight',
    behaviour: { kind: 'hero', routine: 'wander' },
    stats: { health: 5, defence: 3, speed: 0.95 },
    moves: { style: 'defensive', power: 1, speed: 1 },
  },
  {
    name: 'Ranger',
    behaviour: { kind: 'hero', routine: 'wander' },
    stats: { health: 3, speed: 1.2, jump: 1.15 },
    moves: { style: 'swift', power: 1, speed: 1 },
  },
  {
    name: 'Wizard',
    behaviour: { kind: 'hero', routine: 'wander' },
    stats: { health: 3, stamina: 150, strength: 1.3 },
    moves: { style: 'balanced', power: 1.1, speed: 0.9 },
  },
  { name: 'Racer', behaviour: { kind: 'racer', routine: 'wander' }, stats: { speed: 1.5, jump: 1.1 } },
  { name: 'Shopkeeper', behaviour: { kind: 'shopkeeper', routine: 'stand' }, stats: {} },
  { name: 'Villager', behaviour: { kind: 'villager', routine: 'wander' }, stats: {} },
  { name: 'Quest giver', behaviour: { kind: 'questGiver', routine: 'stand' }, stats: {} },
  {
    name: 'Brute',
    behaviour: { kind: 'enemy', routine: 'wander' },
    stats: { strength: 1.6, speed: 0.8 },
    moves: { style: 'heavy', power: 1, speed: 1 },
  },
  {
    name: 'Boss',
    behaviour: { kind: 'boss', routine: 'stand' },
    stats: { strength: 2, defence: 4 },
    moves: { style: 'heavy', power: 1.2, speed: 1 },
  },
];

export function BehaviourTab({ c, chr, save, isHero, inProject }: Props & { isHero: boolean; inProject: boolean }) {
  const { ed } = c;
  const b: Behaviour = chr.behaviour ?? { kind: isHero ? 'hero' : 'villager', routine: 'wander' };
  const party = ed.store.manifest.party ?? [];
  const inParty = isHero || party.includes(chr.id);
  return (
    <div class="sec" data-tour="char-behaviour" data-help="characters.behaviour">
      <div class="sech">
        <span>
          Behaviour
          <FieldHelp label="Behaviour" text={SHEET_HELP.behaviour} />
        </span>
      </div>
      <label class="field">
        Kind of character
        <select
          class="inp"
          aria-label="Kind of character"
          value={b.kind}
          onChange={(e) =>
            save(
              { ...chr, behaviour: { ...b, kind: (e.target as HTMLSelectElement).value as Behaviour['kind'] } },
              'Kind of character',
            )
          }
        >
          {BEHAVIOURS.map((k) => (
            <option value={k}>{BEHAVIOUR_INFO[k].label}</option>
          ))}
        </select>
      </label>
      <p class="muted small">{BEHAVIOUR_INFO[b.kind].about}</p>
      {!isHero && (
        <div class="seg" role="radiogroup" aria-label="On its own it">
          {(
            [
              ['wander', 'Walks around'],
              ['stand', 'Stands still'],
            ] as const
          ).map(([r, label]) => (
            <button
              type="button"
              role="radio"
              aria-checked={b.routine === r}
              class={`btn small ${b.routine === r ? 'on' : ''}`}
              onClick={() => save({ ...chr, behaviour: { ...b, routine: r } }, label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div class="sech" style={{ marginTop: '10px' }}>
        <span>Start from a role</span>
      </div>
      <div class="role-presets">
        {ROLE_PRESETS.map((p) => (
          <button
            type="button"
            class="chip"
            title={`${BEHAVIOUR_INFO[p.behaviour.kind].label}: ${
              Object.entries(p.stats)
                .map(([k, v]) => `${k} ${v}`)
                .join(', ') || 'default stats'
            }`}
            onClick={() =>
              save(
                {
                  ...chr,
                  behaviour: isHero ? { ...p.behaviour, kind: 'hero' } : p.behaviour,
                  stats: { ...DEFAULT_STATS, ...(chr.stats ?? {}), ...p.stats },
                  ...(p.moves ? { moves: p.moves } : {}),
                },
                `Role: ${p.name}`,
              )
            }
          >
            {p.name}
          </button>
        ))}
      </div>
      <div class="sech" style={{ marginTop: '10px' }}>
        <span>Party</span>
      </div>
      <label class="lbl">
        <input
          type="checkbox"
          checked={inParty}
          disabled={isHero || !inProject}
          onChange={() =>
            ed.exec(
              {
                type: 'project.update',
                payload: { party: inParty ? party.filter((x) => x !== chr.id) : [...party, chr.id].slice(0, 6) },
              },
              { label: inParty ? 'Leave the party' : 'Join the party' },
            )
          }
        />{' '}
        {isHero ? 'The player character leads the party' : `${chr.name} is a playable hero (H switches in Play)`}
      </label>
    </div>
  );
}
