import { genreById } from '../../builtin/genres';
import { lookOf } from '../../core/dialogue/checks';
import { DIALOGUE_STYLES, type DialogueLook, type DialogueStyle, STYLE_INFO } from '../../core/dialogue/schema';
import type { TalkView } from '../../engine/runtime/conversation';
import { DialogueLayer } from '../../engine/ui/DialogueLayer';
import type { ActionCtx } from '../actions/registry';
import { ListenButton } from '../components/EventPicker';
import { FieldHelp } from '../components/fields';
import { shows } from '../genres/view';
import { soundOptions } from './AudioFields';

/** P22: what the Dialogue section's controls mean (their “?”) */
export const DIALOGUE_HELP = {
  style:
    'How conversations look in this game. A conversation can pick its own style (Characters › Dialogue), and signs read as a Sign unless their conversation picks one.',
  speed:
    'Letters per second as a line appears. 0 shows the whole line at once. Pressing next shows the rest of a line first.',
  blip: 'The sound played as letters appear (voice blips). A low pitch sounds big, a high one small.',
  auto: 'Seconds a finished line stays before the next one comes by itself. 0 waits for the player.',
};

const sample = (look: DialogueLook, style: DialogueStyle): TalkView => ({
  conversation: 'sample',
  name: 'Sample',
  look: { ...look, style },
  who: 'chr_sample0000',
  speakerName: 'Old Tom',
  nameColor: null,
  voice: null,
  text: 'Welcome, traveller! Mind the bridge.',
  mood: 'happy',
  choices: null,
  serial: 1,
  talker: null,
});

/** Game settings › Dialogue: the style gallery and how lines appear. */
export function DialogueSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  if (!shows(ed, 'section', 'game.dialogue')) return null;
  const p = ed.store.manifest;
  const look = lookOf(p, genreById(p.genre));
  const own = p.dialogue ?? {};
  const set = (patch: Partial<DialogueLook>) =>
    ed.exec({ type: 'project.update', payload: { dialogue: { ...own, ...patch } } }, { label: 'Dialogue style' });
  return (
    <div class="sec" data-tour="game-dialogue" data-help="scene.dialogue">
      <div class="sech">
        <span>
          Dialogue
          <FieldHelp label="Dialogue style" text={DIALOGUE_HELP.style} />
        </span>
      </div>
      <div class="dlg-gallery" role="radiogroup" aria-label="Dialogue style">
        {DIALOGUE_STYLES.map((s) => (
          <button
            type="button"
            role="radio"
            aria-checked={look.style === s}
            data-tour={`dialogue-style-${s}`}
            class={`dlg-card ${look.style === s ? 'on' : ''}`}
            title={STYLE_INFO[s].looks}
            onClick={() => set({ style: s })}
          >
            <div class="dlg-mini" aria-hidden="true">
              <DialogueLayer
                view={sample(look, s)}
                shown={99}
                focus={0}
                anchor={{ x: 0.5, y: 0.55 }}
                onNext={() => {}}
                onChoose={() => {}}
                preview
              />
            </div>
            <span>{STYLE_INFO[s].name}</span>
          </button>
        ))}
      </div>
      <label class="field">
        <span>
          Text speed: {look.textSpeed ? `${look.textSpeed} letters a second` : 'all at once'}
          <FieldHelp label="Text speed" text={DIALOGUE_HELP.speed} />
        </span>
        <input
          type="range"
          min={0}
          max={120}
          step={5}
          aria-label="Text speed"
          value={look.textSpeed}
          onChange={(e) => set({ textSpeed: Number((e.target as HTMLInputElement).value) })}
        />
      </label>
      <div class="grid2">
        <label class="field">
          <span>
            Voice blip
            <FieldHelp label="Voice blip" text={DIALOGUE_HELP.blip} />
          </span>
          <span class="row pv-row">
            <select
              class="inp"
              aria-label="Voice blip"
              value={look.blip ?? ''}
              onChange={(e) => set({ blip: (e.target as HTMLSelectElement).value || null })}
            >
              <option value="">Silent</option>
              {soundOptions(ed).map((o) => (
                <option value={o.id}>{o.name}</option>
              ))}
            </select>
            {look.blip && (
              <ListenButton
                name={soundOptions(ed).find((o) => o.id === look.blip)?.name ?? look.blip}
                onPlay={() => ed.audio.previewEvent(look.blip!, look.pitch)}
              />
            )}
          </span>
        </label>
        <label class="field">
          Pitch {look.pitch.toFixed(1)}
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            aria-label="Voice pitch"
            value={look.pitch}
            onChange={(e) => set({ pitch: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
      </div>
      <div class="grid2">
        <label class="field">
          <span>
            Next line by itself after (s)
            <FieldHelp label="Auto advance" text={DIALOGUE_HELP.auto} />
          </span>
          <input
            class="inp mono"
            aria-label="Auto advance seconds"
            inputMode="decimal"
            value={String(look.autoAdvance)}
            onChange={(e) => {
              const n = Number((e.target as HTMLInputElement).value);
              if (Number.isFinite(n)) set({ autoAdvance: Math.max(0, Math.min(30, n)) });
            }}
          />
        </label>
        <label class="field">
          Choices
          <select
            class="inp"
            aria-label="Choice layout"
            value={look.choices}
            onChange={(e) => set({ choices: (e.target as HTMLSelectElement).value as DialogueLook['choices'] })}
          >
            <option value="list">A list</option>
            <option value="buttons">Buttons in a row</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label class="small">
          <input
            type="checkbox"
            checked={look.portrait}
            onChange={(e) => set({ portrait: (e.target as HTMLInputElement).checked })}
          />{' '}
          Portraits
        </label>
        <label class="small">
          Box{' '}
          <input
            type="color"
            aria-label="Box colour"
            value={look.bg.slice(0, 7)}
            onChange={(e) => set({ bg: `${(e.target as HTMLInputElement).value}e8` })}
          />
        </label>
        <label class="small">
          Text{' '}
          <input
            type="color"
            aria-label="Text colour"
            value={look.color}
            onChange={(e) => set({ color: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="small">
          Names{' '}
          <input
            type="color"
            aria-label="Name colour"
            value={look.nameColor}
            onChange={(e) => set({ nameColor: (e.target as HTMLInputElement).value })}
          />
        </label>
      </div>
      {p.dialogue && (
        <button
          type="button"
          class="link small"
          onClick={() => ed.exec({ type: 'project.update', payload: { dialogue: null } }, { label: 'Dialogue style' })}
        >
          Back to the {genreById(p.genre).name} style
        </button>
      )}
    </div>
  );
}
