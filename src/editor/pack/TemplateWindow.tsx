import { useState } from 'preact/hooks';
import { CUTSCENE_TEMPLATES } from '../../builtin/templates/cutscenes';
import { SCRIPT_TEMPLATES, type TemplateField } from '../../builtin/templates/scripts';
import type { ActionCtx } from '../actions/registry';
import { Modal } from '../shell/Shell';
import { defaultAnswer, fieldChoices, useCutsceneTemplate, useScriptTemplate } from './templates';

export const TEMPLATES_HELP =
  'Ready-made logic and scenes from the adventure starter pack. Pick one, fill in the blanks (which door, which boss, how many) and press Make it: a script becomes an ordinary logic file in Logic (read it as a graph or as code, change anything), a cutscene becomes a scene in Cinematics plus the small logic file that plays it. Each Make it is one undo step.';

/**
 * Step 11, 4c: the template window: the starter pack's ten script templates or three cutscene templates, a short
 * form for the chosen one, and Make it. Opened from the pack panel, Logic (From a template…) and Cinematics.
 */
export function TemplateWindow({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const open = ed.templates.value!;
  const list = open.kind === 'script' ? SCRIPT_TEMPLATES : CUTSCENE_TEMPLATES;
  const [id, setId] = useState(open.id && list.some((t) => t.id === open.id) ? open.id : list[0]!.id);
  const t = list.find((x) => x.id === id) ?? list[0]!;
  const start = () => Object.fromEntries(t.fields.map((f) => [f.key, defaultAnswer(ed, f)]));
  const [answers, setAnswers] = useState<Record<string, Record<string, string | number>>>({});
  const a = answers[t.id] ?? start();
  const [error, setError] = useState('');
  const close = () => (ed.templates.value = null);
  const set = (k: string, v: string | number) => {
    setAnswers({ ...answers, [t.id]: { ...a, [k]: v } });
    setError('');
  };
  const make = () => {
    if (open.kind === 'script') {
      const r = useScriptTemplate(ed, t as (typeof SCRIPT_TEMPLATES)[number], a);
      if ('error' in r) return setError(r.error);
      close();
      ed.logicGraph.value = r.graph;
      c.ui.workspace('Logic');
      ed.notify(`Made “${t.name}”. It runs when you press Play; read or change it here.`);
    } else {
      const r = useCutsceneTemplate(ed, t as (typeof CUTSCENE_TEMPLATES)[number], a);
      if ('error' in r) return setError(r.error);
      close();
      ed.cinematicId.value = r.cinematic;
      c.ui.workspace('Cinematics');
      ed.notify(
        `Made the scene “${t.name}”${r.graph ? ' and the logic that plays it' : ''}. Press ▶ to watch it here.`,
      );
    }
  };
  const title = open.kind === 'script' ? 'Script templates' : 'Cutscene templates';
  return (
    <Modal title={title} onClose={close}>
      <div class="tpl" data-tour="template-window" data-help="pack.templates">
        <div class="tpl-list" role="listbox" aria-label={title}>
          {list.map((x) => (
            <button
              type="button"
              role="option"
              aria-selected={x.id === t.id}
              class={`mi tpl-item ${x.id === t.id ? 'on' : ''}`}
              data-tour={`tpl-${x.id}`}
              onClick={() => {
                setId(x.id);
                setError('');
              }}
            >
              <strong>{x.name}</strong>
            </button>
          ))}
        </div>
        <div class="tpl-form">
          <h3 class="tpl-name">{t.name}</h3>
          <p class="small">{t.about}.</p>
          {t.needs && <p class="muted small">Needs: {t.needs}.</p>}
          {t.fields.map((f) => (
            <Field key={`${t.id}:${f.key}`} f={f} value={a[f.key] ?? ''} choices={fieldChoices(ed, f)} set={set} />
          ))}
          {error && (
            <p class="tpl-error small" role="alert">
              {error}
            </p>
          )}
          <div class="row" style={{ gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" class="btn" onClick={close}>
              Cancel
            </button>
            <button type="button" class="btn go" data-tour="template-make" onClick={make}>
              Make it
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  f,
  value,
  choices,
  set,
}: {
  f: TemplateField;
  value: string | number;
  choices: string[];
  set: (k: string, v: string | number) => void;
}) {
  const list = choices.length ? `tpl-${f.key}-list` : undefined;
  return (
    <div class="field tpl-field" data-tip={f.help}>
      <span>
        {f.label}
        {f.optional && <span class="muted small"> (optional)</span>}
      </span>
      {f.kind === 'number' ? (
        <input
          class="inp"
          type="number"
          aria-label={f.label}
          min={f.min}
          max={f.max}
          value={value}
          onInput={(e) => set(f.key, Number((e.target as HTMLInputElement).value))}
        />
      ) : (
        <input
          class="inp"
          type="text"
          aria-label={f.label}
          list={list}
          value={String(value)}
          placeholder={choices.length ? 'Pick or type a name' : f.optional ? 'Leave empty if not needed' : ''}
          onInput={(e) => set(f.key, (e.target as HTMLInputElement).value)}
        />
      )}
      {list && (
        <datalist id={list}>
          {choices.map((x) => (
            <option value={x} />
          ))}
        </datalist>
      )}
      <span class="muted small">{f.help}</span>
    </div>
  );
}
