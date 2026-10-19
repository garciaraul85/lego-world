import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { genreById } from '../../../builtin/genres';
import { checkConversation } from '../../../core/dialogue/checks';
import { checkCondition, conditionNames } from '../../../core/dialogue/condition';
import {
  type Choice,
  type ChoiceOption,
  type Conversation,
  DIALOGUE_STYLES,
  MOODS,
  STYLE_INFO,
  type Step,
} from '../../../core/dialogue/schema';
import { parseScript, printScript } from '../../../core/dialogue/script';
import { type Character, paths, type Variables } from '../../../core/schema';
import { TalkSystem } from '../../../engine/runtime/talk';
import { interpolate } from '../../../engine/ui/bindings';
import { DialogueLayer } from '../../../engine/ui/DialogueLayer';
import type { ActionCtx } from '../../actions/registry';
import { ActionListField } from '../../components/ActionListField';
import { DraftText } from '../../components/fields';
import { actionChoices } from '../../panels/AudioFields';
import { characters, freeLabel, layers, moveStep, scriptNames, speakers, withStep } from './model';

/**
 * P22 dialogue editor: one conversation as a list (lines like a chat script, with “if” chips and choice
 * buttons), a graph (sections as boxes, choices and jumps as arrows) or a script for writers — all three
 * edit the same data, one undo step per edit. Preview plays it here with the variables set on the side,
 * so every branch can be tried without playing the game. Checks list what can never play or is broken.
 */
export function DialogueEditor({ c, conv }: { c: ActionCtx; conv: Conversation }) {
  const { ed } = c;
  ed.revision.value;
  const view = ed.dialogueView.value;
  const [preview, setPreview] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const save = (next: Conversation, label: string) =>
    ed.exec({ type: 'dialogue.put', payload: { conversation: next } }, { label });
  const issues = checkConversation(conv, {
    character: (id) => ed.store.has(paths.character(id)),
    file: (p) => ed.store.has(p),
  });
  const errors = issues.filter((i) => i.level === 'error').length;
  return (
    <div class={`dlg-editor ${preview ? 'with-preview' : ''}`} data-help="characters.dialogue">
      <div class="dlg-head">
        <DraftText
          class="inp dlg-name"
          aria-label="Conversation name"
          tour="dialogue-name"
          value={conv.name}
          onCommit={(t) => {
            const name = t.trim().slice(0, 60);
            if (!name) return false;
            save({ ...conv, name }, 'Rename conversation');
          }}
        />
        <label class="small muted">
          Style{' '}
          <select
            class="inp"
            aria-label="Conversation style"
            value={conv.style ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              const { style: _s, ...rest } = conv;
              save(v ? { ...rest, style: v as Conversation['style'] & string } : rest, 'Conversation style');
            }}
          >
            <option value="">The game’s style</option>
            {DIALOGUE_STYLES.map((s) => (
              <option value={s}>{STYLE_INFO[s].name}</option>
            ))}
          </select>
        </label>
        <div class="seg" role="radiogroup" aria-label="Show the conversation as">
          {(
            [
              ['list', 'List'],
              ['graph', 'Graph'],
              ['script', 'Script'],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              role="radio"
              aria-checked={view === id}
              data-tour={`dialogue-view-${id}`}
              class={`btn small ${view === id ? 'on' : ''}`}
              onClick={() => (ed.dialogueView.value = id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          class={`btn small ${issues.length ? (errors ? 'warn' : '') : ''}`}
          aria-expanded={showChecks}
          data-tour="dialogue-checks"
          onClick={() => setShowChecks(!showChecks)}
        >
          {issues.length ? `⚠ ${issues.length} to check` : '✓ No problems'}
        </button>
        <button
          type="button"
          class={`btn small ${preview ? 'on' : ''}`}
          data-tour="dialogue-preview-btn"
          aria-pressed={preview}
          onClick={() => setPreview(!preview)}
        >
          ▶ Preview
        </button>
      </div>
      {showChecks && issues.length > 0 && (
        <ul class="dlg-checks" aria-label="Conversation checks">
          {issues.map((i) => (
            <li class={i.level}>
              <b>{i.section}</b>
              {i.step >= 0 ? ` · step ${i.step + 1}` : ''}: {i.message}
            </li>
          ))}
        </ul>
      )}
      <div class="dlg-body">
        <div class="dlg-main">
          {view === 'list' && <ListView c={c} conv={conv} save={save} />}
          {view === 'graph' && <GraphView c={c} conv={conv} />}
          {view === 'script' && <ScriptView c={c} conv={conv} save={save} />}
        </div>
        {preview && <Preview c={c} conv={conv} />}
      </div>
    </div>
  );
}

type Save = (next: Conversation, label: string) => unknown;

/** “if …” on a step or an option: click to write a condition; mistakes show at once. */
function CondChip({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const bad = checkCondition(value);
  if (!open && !value)
    return (
      <button type="button" class="chip dlg-if add" title="Only when a condition holds" onClick={() => setOpen(true)}>
        + if
      </button>
    );
  if (!open)
    return (
      <button
        type="button"
        class={`chip dlg-if ${bad ? 'bad' : ''}`}
        title={bad ?? 'Only when this holds'}
        onClick={() => setOpen(true)}
      >
        if {value}
      </button>
    );
  return (
    <span class="dlg-if-edit">
      <DraftText
        class="inp mono"
        aria-label="Condition"
        placeholder="gems >= 50 and talks > 0"
        value={value ?? ''}
        onCommit={(t) => {
          setOpen(false);
          onChange(t.trim() || undefined);
        }}
      />
      {bad && <span class="err small">{bad}</span>}
    </span>
  );
}

const withIf = <T extends { if?: string | undefined }>(x: T, v: string | undefined): T => {
  const { if: _old, ...rest } = x;
  return (v ? { ...rest, if: v } : rest) as T;
};

function ListView({ c, conv, save }: { c: ActionCtx; conv: Conversation; save: Save }) {
  const { ed } = c;
  const who = speakers(
    ed,
    conv.sections.flatMap((s) => s.steps.flatMap((st) => (st.k === 'line' ? [st.who] : []))),
  );
  const labels = conv.sections.map((s) => s.label);
  const choices = actionChoices(ed);
  const add = (si: number, st: Step, label: string) =>
    save({ ...conv, sections: conv.sections.map((s, k) => (k === si ? { ...s, steps: [...s.steps, st] } : s)) }, label);
  return (
    <div class="dlg-list" role="group" aria-label="Conversation steps">
      {conv.sections.map((sec, si) => (
        <section class="dlg-sec" id={`dlg-sec-${sec.label}`} aria-label={`Section ${sec.label}`}>
          <header>
            <span class="muted small">{si === 0 ? 'starts here' : 'section'}</span>
            <DraftText
              class="inp mono dlg-label"
              aria-label="Section name"
              value={sec.label}
              onCommit={(t) => {
                const l = t.trim().toLowerCase();
                if (!/^[a-z][a-z0-9_-]{0,39}$/.test(l) || labels.includes(l)) {
                  ed.notify(
                    'A section name is lower case letters, digits, - or _, and different from the others.',
                    true,
                  );
                  return false;
                }
                // jumps and options that went to the old name follow it
                const re = (to?: string) => (to === sec.label ? l : to);
                save(
                  {
                    ...conv,
                    sections: conv.sections.map((s, k) => ({
                      label: k === si ? l : s.label,
                      steps: s.steps.map((st) =>
                        st.k === 'goto'
                          ? { ...st, to: re(st.to)! }
                          : st.k === 'choice'
                            ? { ...st, options: st.options.map((o) => (o.to ? { ...o, to: re(o.to) } : o)) }
                            : st,
                      ),
                    })),
                  },
                  'Rename section',
                );
              }}
            />
            {si > 0 && (
              <button
                type="button"
                class="btn icon"
                aria-label={`Delete section ${sec.label}`}
                onClick={() => save({ ...conv, sections: conv.sections.filter((_, k) => k !== si) }, 'Delete section')}
              >
                ×
              </button>
            )}
          </header>
          {sec.steps.map((st, i) => (
            <StepRow
              key={`${si}:${i}`}
              st={st}
              who={who}
              labels={labels}
              choices={choices}
              set={(next, label) => save(withStep(conv, si, i, next), label)}
              move={(by) => save(moveStep(conv, si, i, by), 'Move step')}
            />
          ))}
          <div class="dlg-add" role="group" aria-label={`Add to ${sec.label}`}>
            <button
              type="button"
              class="btn small"
              onClick={() => {
                const last = [...sec.steps].reverse().find((x) => x.k === 'line');
                add(si, { k: 'line', who: last?.k === 'line' ? last.who : (who[1]?.who ?? ''), text: '…' }, 'Add line');
              }}
            >
              + Line
            </button>
            <button
              type="button"
              class="btn small"
              onClick={() =>
                add(
                  si,
                  {
                    k: 'choice',
                    options: [
                      { text: 'Yes', to: 'end' },
                      { text: 'No', to: 'end' },
                    ],
                  },
                  'Add choice',
                )
              }
            >
              + Choice
            </button>
            <button
              type="button"
              class="btn small"
              onClick={() =>
                add(si, { k: 'do', actions: [{ do: 'setVar', var: 'talked', value: true }] }, 'Add action')
              }
            >
              + Action
            </button>
            <button type="button" class="btn small" onClick={() => add(si, { k: 'like', by: 5 }, 'Add like')}>
              + Likes
            </button>
            <button type="button" class="btn small" onClick={() => add(si, { k: 'goto', to: 'end' }, 'Add jump')}>
              + Jump
            </button>
          </div>
        </section>
      ))}
      <button
        type="button"
        class="btn"
        onClick={() =>
          save({ ...conv, sections: [...conv.sections, { label: freeLabel(conv), steps: [] }] }, 'Add section')
        }
      >
        + Section
      </button>
    </div>
  );
}

function StepRow({
  st,
  who,
  labels,
  choices,
  set,
  move,
}: {
  st: Step;
  who: { who: string; name: string }[];
  labels: string[];
  choices: ReturnType<typeof actionChoices>;
  set: (next: Step | null, label: string) => void;
  move: (by: number) => void;
}) {
  const tools = (
    <span class="dlg-tools">
      <CondChip value={st.if} onChange={(v) => set(withIf(st, v), 'Condition')} />
      <button type="button" class="btn icon" aria-label="Move up" onClick={() => move(-1)}>
        ↑
      </button>
      <button type="button" class="btn icon" aria-label="Move down" onClick={() => move(1)}>
        ↓
      </button>
      <button type="button" class="btn icon" aria-label="Remove step" onClick={() => set(null, 'Remove step')}>
        ×
      </button>
    </span>
  );
  switch (st.k) {
    case 'line':
      return (
        <div class="dlg-step line">
          <select
            class="inp dlg-who"
            aria-label="Who says it"
            value={st.who}
            onChange={(e) => set({ ...st, who: (e.target as HTMLSelectElement).value }, 'Speaker')}
          >
            {who.map((w) => (
              <option value={w.who}>{w.name}</option>
            ))}
          </select>
          <select
            class="inp dlg-mood"
            aria-label="Mood"
            value={st.mood ?? 'neutral'}
            onChange={(e) => {
              const m = (e.target as HTMLSelectElement).value as Step & { k: 'line' } extends { mood?: infer M }
                ? M
                : never;
              const { mood: _m, ...rest } = st;
              set(m === 'neutral' ? rest : { ...rest, mood: m }, 'Mood');
            }}
          >
            {MOODS.map((m) => (
              <option value={m}>{m}</option>
            ))}
          </select>
          <DraftText
            class="inp dlg-text"
            aria-label="Line"
            value={st.text}
            onCommit={(t) => {
              const text = t.trim().slice(0, 400);
              if (!text) return false;
              set({ ...st, text }, 'Edit line');
            }}
          />
          {tools}
        </div>
      );
    case 'choice':
      return (
        <div class="dlg-step choice">
          <div class="row">
            <b class="small">Choice</b>
            <span class="muted small">the player picks one</span>
            {tools}
          </div>
          {st.options.map((o, oi) => (
            <OptionRow
              o={o}
              labels={labels}
              set={(next) =>
                set(
                  {
                    ...st,
                    options: next
                      ? st.options.map((x, j) => (j === oi ? next : x))
                      : st.options.filter((_, j) => j !== oi),
                  } as Choice,
                  next ? 'Edit option' : 'Remove option',
                )
              }
              canRemove={st.options.length > 1}
            />
          ))}
          {st.options.length < 6 && (
            <button
              type="button"
              class="btn small"
              onClick={() => set({ ...st, options: [...st.options, { text: 'Another option' }] }, 'Add option')}
            >
              + Option
            </button>
          )}
        </div>
      );
    case 'do':
      return (
        <div class="dlg-step do">
          <div class="row">
            <b class="small">⚙ Actions</b>
            {tools}
          </div>
          <ActionListField
            value={st.actions}
            states={[]}
            choices={choices}
            onChange={(next) =>
              next.length ? set({ ...st, actions: next.slice(0, 8) }, 'Edit actions') : set(null, 'Remove step')
            }
          />
        </div>
      );
    case 'like':
      return (
        <div class="dlg-step like">
          <b class="small">♥ Likes the hero</b>
          <input
            class="inp mono"
            aria-label="Likes change"
            inputMode="numeric"
            value={st.by >= 0 ? `+${st.by}` : String(st.by)}
            onChange={(e) => {
              const n = Math.round(Number((e.target as HTMLInputElement).value));
              if (Number.isFinite(n)) set({ ...st, by: Math.max(-100, Math.min(100, n)) }, 'Likes');
            }}
          />
          <span class="muted small">(−100 to 100 in all)</span>
          {tools}
        </div>
      );
    case 'goto':
      return (
        <div class="dlg-step goto">
          <b class="small">→ Jump to</b>
          <select
            class="inp"
            aria-label="Jump to"
            value={st.to}
            onChange={(e) => set({ ...st, to: (e.target as HTMLSelectElement).value }, 'Jump')}
          >
            <option value="end">the end</option>
            {labels.map((l) => (
              <option value={l}>{l}</option>
            ))}
          </select>
          {tools}
        </div>
      );
  }
}

function OptionRow({
  o,
  labels,
  set,
  canRemove,
}: {
  o: ChoiceOption;
  labels: string[];
  set: (next: ChoiceOption | null) => void;
  canRemove: boolean;
}) {
  return (
    <div class="dlg-option">
      <span class="muted">•</span>
      <DraftText
        class="inp"
        aria-label="Option"
        value={o.text}
        onCommit={(t) => {
          const text = t.trim().slice(0, 120);
          if (!text) return false;
          set({ ...o, text });
        }}
      />
      <CondChip value={o.if} onChange={(v) => set(withIf(o, v))} />
      {o.if && (
        <label class="small muted" title="When the condition fails: show it greyed out instead of hiding it">
          <input
            type="checkbox"
            checked={o.failed === 'grey'}
            onChange={(e) => {
              const { failed: _f, ...rest } = o;
              set((e.target as HTMLInputElement).checked ? { ...rest, failed: 'grey' } : rest);
            }}
          />{' '}
          grey
        </label>
      )}
      <select
        class="inp"
        aria-label="Then"
        value={o.to ?? ''}
        onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          const { to: _t, ...rest } = o;
          set(v ? { ...rest, to: v } : rest);
        }}
      >
        <option value="">→ carry on</option>
        <option value="end">→ end</option>
        {labels.map((l) => (
          <option value={l}>→ {l}</option>
        ))}
      </select>
      {canRemove && (
        <button type="button" class="btn icon" aria-label="Remove option" onClick={() => set(null)}>
          ×
        </button>
      )}
    </div>
  );
}

/** The conversation as boxes and arrows: one box per section, columns by how far from the start. */
function GraphView({ c, conv }: { c: ActionCtx; conv: Conversation }) {
  const { ed } = c;
  const names = scriptNames(ed);
  const cols = layers(conv);
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<{ d: string; end: boolean }[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const at = el.getBoundingClientRect();
    const out: { d: string; end: boolean }[] = [];
    for (const from of el.querySelectorAll<HTMLElement>('[data-to]')) {
      const to = from.dataset.to!;
      const a = from.getBoundingClientRect();
      const x1 = a.right - at.left + el.scrollLeft;
      const y1 = a.top + a.height / 2 - at.top + el.scrollTop;
      if (to === 'end') {
        out.push({ d: `M${x1} ${y1} h18`, end: true });
        continue;
      }
      const t = el.querySelector<HTMLElement>(`[data-node="${to}"]`)?.getBoundingClientRect();
      if (!t) continue;
      const x2 = t.left - at.left + el.scrollLeft;
      const y2 = t.top + 16 - at.top + el.scrollTop;
      const mid = Math.max(30, Math.abs(x2 - x1) / 2);
      out.push({ d: `M${x1} ${y1} C${x1 + mid} ${y1} ${x2 - mid} ${y2} ${x2} ${y2}`, end: false });
    }
    setEdges(out);
  }, [conv, cols.length]);
  const open = (label: string) => {
    ed.dialogueView.value = 'list';
    setTimeout(() => document.getElementById(`dlg-sec-${label}`)?.scrollIntoView({ block: 'start' }), 50);
  };
  const short = (t: string) => (t.length > 46 ? `${t.slice(0, 44)}…` : t);
  return (
    <div class="dlg-graph" ref={box} role="group" aria-label="Conversation graph">
      <svg class="dlg-edges" aria-hidden="true">
        <defs>
          <marker id="dlg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L8 4L0 8z" fill="currentColor" />
          </marker>
        </defs>
        {edges.map((e) => (
          <path d={e.d} class={e.end ? 'end' : ''} marker-end="url(#dlg-arrow)" />
        ))}
      </svg>
      {cols.map((col) => (
        <div class="dlg-col">
          {col.map((label) => {
            const sec = conv.sections.find((s) => s.label === label)!;
            return (
              <button
                type="button"
                class="dlg-node"
                data-node={label}
                onClick={() => open(label)}
                title="Edit in the list"
              >
                <b class="mono">{label}</b>
                {sec.steps.map((st) => (
                  <div class={`dlg-g ${st.k}`} {...(st.k === 'goto' ? { 'data-to': st.to } : {})}>
                    {st.if && <span class="dlg-gif">if {st.if}</span>}
                    {st.k === 'line' && (
                      <>
                        <b>{st.who ? names.nameOf(st.who) : 'Narrator'}:</b> {short(st.text)}
                      </>
                    )}
                    {st.k === 'choice' &&
                      st.options.map((o) => (
                        <div class="dlg-gopt" {...(o.to ? { 'data-to': o.to } : {})}>
                          • {short(o.text)}
                          {o.if ? ` [if ${o.if}]` : ''}
                        </div>
                      ))}
                    {st.k === 'do' && <>⚙ {st.actions.map((a) => a.do).join(', ')}</>}
                    {st.k === 'like' && <>♥ {st.by >= 0 ? `+${st.by}` : st.by}</>}
                    {st.k === 'goto' && <>→ {st.to}</>}
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The conversation as text: edit it as a writer would; Apply (or Ctrl Enter) puts it back. */
function ScriptView({ c, conv, save }: { c: ActionCtx; conv: Conversation; save: Save }) {
  const { ed } = c;
  const names = scriptNames(ed);
  const printed = printScript(conv, names);
  const [text, setText] = useState(printed);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setText(printed);
  }, [printed]);
  const parsed = useMemo(() => parseScript(text, conv, names), [text, conv.id]);
  const apply = () => {
    if (parsed.errors.length) {
      ed.notify(`Line ${parsed.errors[0]!.line}: ${parsed.errors[0]!.message}`, true);
      return;
    }
    if (save(parsed.conversation, 'Edit script')) setDirty(false);
    else setDirty(false);
  };
  return (
    <div class="dlg-script">
      <textarea
        class="inp mono"
        aria-label="Conversation script"
        data-tour="dialogue-script"
        spellcheck={false}
        value={text}
        onInput={(e) => {
          setText((e.target as HTMLTextAreaElement).value);
          setDirty(true);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <div class="row">
        <button
          type="button"
          class="btn on"
          data-tour="dialogue-apply"
          disabled={!dirty || parsed.errors.length > 0}
          onClick={apply}
        >
          Apply
        </button>
        {dirty && (
          <button
            type="button"
            class="btn"
            onClick={() => {
              setText(printed);
              setDirty(false);
            }}
          >
            Undo typing
          </button>
        )}
        <span class="muted small">
          == section · Who (mood): line · * option [if …] -&gt; section · &gt; set / add / give / like · -&gt; end
        </span>
      </div>
      {parsed.errors.length > 0 && (
        <ul class="dlg-checks" aria-label="Script mistakes">
          {parsed.errors.map((e) => (
            <li class="error">
              Line {e.line}: {e.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Plays the conversation here, with variables, items, talks and likes set on the side. */
function Preview({ c, conv }: { c: ActionCtx; conv: Conversation }) {
  const { ed } = c;
  const names = useMemo(
    () =>
      [
        ...new Set(
          conv.sections.flatMap((s) =>
            s.steps.flatMap((st) => [
              ...conditionNames(st.if),
              ...(st.k === 'choice' ? st.options.flatMap((o) => conditionNames(o.if)) : []),
            ]),
          ),
        ),
      ].filter((n) => n !== 'talks' && n !== 'likes' && n !== 'time'),
    [conv],
  );
  const defaults = ed.store.get<Variables>(paths.variables)?.vars ?? {};
  const [vals, setVals] = useState<Record<string, string>>({});
  const [talks, setTalks] = useState(0);
  const [likes, setLikes] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [, setFrame] = useState(0);
  const [run, setRun] = useState(0);
  const talker = useMemo(
    () => characters(ed).find((ch: Character) => ch.talk?.some((t) => t.conversation === conv.id))?.id ?? null,
    [conv.id, ed.revision.value],
  );
  const sys = useMemo(() => {
    const vars = new Map<string, unknown>(Object.entries(defaults).map(([k, v]) => [k, v.default]));
    const inventory = new Map<string, number>();
    for (const [k, v] of Object.entries(vals)) {
      if (k.startsWith('has ')) inventory.set(k.slice(4), Number(v) || 0);
      else
        vars.set(
          k,
          v === ''
            ? undefined
            : Number.isFinite(Number(v))
              ? Number(v)
              : v === 'true'
                ? true
                : v === 'false'
                  ? false
                  : v,
        );
    }
    if (talker) {
      vars.set(`talks.${talker}`, talks);
      vars.set(`likes.${talker}`, likes);
    }
    const lines: string[] = [];
    const t = new TalkSystem({
      get: (p) => (p === paths.dialogue(conv.id) ? conv : ed.store.get(p)),
      project: ed.store.manifest,
      genre: genreById(ed.store.manifest.genre),
      vars,
      setVar: (n, v) => {
        vars.set(n, v);
        if (!n.startsWith('talks.')) lines.push(`${n} = ${JSON.stringify(v)}`);
      },
      inventory,
      run: (actions) => {
        for (const a of actions) {
          if (a.do === 'setVar') vars.set(a.var, a.value);
          if (a.do === 'addVar') vars.set(a.var, Number(vars.get(a.var) ?? 0) + a.value);
          if (a.do === 'give') inventory.set(a.item, (inventory.get(a.item) ?? 0) + (a.count ?? 1));
          lines.push(`⚙ ${a.do}${'var' in a ? ` ${a.var}` : ''}${'item' in a ? ` ${a.item}` : ''}`);
        }
      },
      text: (s) => interpolate(s, (n) => (n === 'hero.name' ? 'Hero' : vars.get(n))),
      timeOfDay: () => 'day',
      objectState: () => undefined,
      fire: (type, m) => lines.push(type === 'event.onChoice' ? `picked “${m.option}”` : 'conversation ended'),
      log: () => {},
      say: () => {},
      now: () => performance.now() / 1000,
    });
    t.start(conv.id, { talker, from: 'npc' });
    setLog(lines);
    return { t, lines };
  }, [conv, vals, talks, likes, run, talker]);
  // letters appear over time
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      setFrame((f) => f + 1);
      if (sys.lines.length !== log.length) setLog([...sys.lines]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sys]);
  const v = sys.t.view;
  return (
    <aside class="dlg-preview" aria-label="Conversation preview" data-tour="dialogue-preview">
      <div class="dlg-stage">
        {v ? (
          <DialogueLayer
            view={v}
            shown={sys.t.revealed()}
            focus={sys.t.focus}
            anchor={{ x: 0.5, y: 0.55 }}
            onNext={() => sys.t.next()}
            onChoose={(i) => sys.t.choose(i)}
            blip={(e, pitch) => ed.audio.previewEvent(e, pitch)}
            preview
          />
        ) : (
          <div class="dlg-ended muted">
            The conversation ended.{' '}
            <button type="button" class="btn small" onClick={() => setRun(run + 1)}>
              ↺ Play again
            </button>
          </div>
        )}
      </div>
      <div class="row">
        <button type="button" class="btn small" onClick={() => setRun(run + 1)}>
          ↺ Restart
        </button>
        <span class="muted small">Click the box or press Next to move on.</span>
        <button type="button" class="btn small" disabled={!v || !!v.choices} onClick={() => sys.t.next()}>
          Next ▸
        </button>
      </div>
      <details open class="dlg-vars">
        <summary>Try it with…</summary>
        {talker && (
          <>
            <label class="field">
              Talked before (talks)
              <input
                class="inp mono"
                aria-label="talks"
                inputMode="numeric"
                value={String(talks)}
                onInput={(e) => setTalks(Number((e.target as HTMLInputElement).value) || 0)}
              />
            </label>
            <label class="field">
              Likes the hero (likes)
              <input
                class="inp mono"
                aria-label="likes"
                inputMode="numeric"
                value={String(likes)}
                onInput={(e) => setLikes(Number((e.target as HTMLInputElement).value) || 0)}
              />
            </label>
          </>
        )}
        {names.map((n) => (
          <label class="field">
            {n.startsWith('has ') ? `Carries ${n.slice(4)}` : n}
            <input
              class="inp mono"
              aria-label={`Preview value ${n}`}
              placeholder={n.startsWith('has ') ? '0' : String(defaults[n]?.default ?? '')}
              value={vals[n] ?? ''}
              onInput={(e) => setVals({ ...vals, [n]: (e.target as HTMLInputElement).value })}
            />
          </label>
        ))}
        {!names.length && !talker && <p class="muted small">No conditions read values in this conversation.</p>}
      </details>
      {log.length > 0 && (
        <ul class="dlg-log small mono" aria-label="What happened">
          {log.map((l) => (
            <li>{l}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
