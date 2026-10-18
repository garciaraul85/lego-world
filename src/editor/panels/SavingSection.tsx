import { genreById } from '../../builtin/genres';
import {
  allSaves,
  DEFAULT_SAVING,
  SAVE_MODE_LABEL,
  SAVE_MODES,
  type SaveMode,
  type Saving,
  slotLine,
} from '../../core/save/save';
import type { Project } from '../../core/schema';
import { BrowserSaveStore } from '../../platform/saves';
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { shows } from '../genres/view';

/** P26: what the Saving section's controls mean (their “?”) */
export const SAVING_HELP = {
  mode: 'How players save this game. Save anywhere: Pause has “Save game”. Only at save points: players save by pressing E at a Save point. Only by checkpoints: the game saves itself when the hero touches a Checkpoint flag or goes through a gate. Save points and Load game work in every mode.',
  slots:
    'How many games a player can keep (1 to 3). Pause › Save game and Load game list the slots; the title screen’s Continue loads the newest save.',
  autosave:
    'The game saves by itself (in its own Autosave slot) when the hero touches a Checkpoint flag or arrives on another map through a gate.',
  saves:
    'Saves made while you play this game here, kept in this browser. They are player progress, never part of the project. Delete them to test from a fresh start.',
};

/** the game's saving settings: its own, else its genre's default */
export const savingOf = (p: Project): Saving => p.saving ?? genreById(p.genre).saving ?? DEFAULT_SAVING;

/** Game settings › Saving: how players save, slots, autosave, and the saves made while testing. */
export function SavingSection({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  ed.playing.value;
  if (!shows(ed, 'section', 'game.saving')) return null;
  const p = ed.store.manifest;
  const s = savingOf(p);
  const set = (patch: Partial<Saving>) =>
    ed.exec({ type: 'project.update', payload: { saving: { ...s, ...patch } } }, { label: 'Saving settings' });
  const store = new BrowserSaveStore();
  const saves = allSaves(store, p.id);
  return (
    <div class="sec" data-help="game.saving" data-tour="game-saving">
      <div class="sech">
        <span>
          Saving
          <FieldHelp label="Saving" text={SAVING_HELP.mode} />
        </span>
      </div>
      <label class="field">
        <span>
          How players save
          <FieldHelp label="How players save" text={SAVING_HELP.mode} />
        </span>
        <select
          class="inp"
          aria-label="How players save"
          data-tour="saving-mode"
          value={s.mode}
          onChange={(e) => set({ mode: (e.target as HTMLSelectElement).value as SaveMode })}
        >
          {SAVE_MODES.map((m) => (
            <option value={m}>{SAVE_MODE_LABEL[m]}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>
          Save slots
          <FieldHelp label="Save slots" text={SAVING_HELP.slots} />
        </span>
        <select
          class="inp"
          aria-label="Save slots"
          data-tour="saving-slots"
          value={String(s.slots)}
          onChange={(e) => set({ slots: Number((e.target as HTMLSelectElement).value) })}
        >
          {[1, 2, 3].map((n) => (
            <option value={String(n)}>{n}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>
          Autosave
          <FieldHelp label="Autosave" text={SAVING_HELP.autosave} />
        </span>
        <input
          type="checkbox"
          aria-label="Autosave"
          data-tour="saving-autosave"
          checked={s.autosave}
          onChange={(e) => set({ autosave: (e.target as HTMLInputElement).checked })}
        />
      </label>
      <div class="small muted" style={{ marginTop: '6px' }}>
        Saves made while testing
        <FieldHelp label="Saves made while testing" text={SAVING_HELP.saves} />
      </div>
      {saves.length ? (
        <>
          {saves.map((g) => (
            <div class="small mono">{slotLine(g.slot, g)}</div>
          ))}
          <button
            type="button"
            class="btn wide"
            data-tour="saving-clear"
            onClick={() => {
              for (const g of saves) store.remove(p.id, g.slot);
              ed.notify('Saves deleted: Play starts from the beginning, and Continue is hidden until the next save.');
              ed.revision.value++;
            }}
          >
            Delete these saves
          </button>
        </>
      ) : (
        <div class="small muted">None yet.</div>
      )}
    </div>
  );
}
