// CodeMirror 6 for the logic code view (P4.4). Imported only when the Code view opens.
import { javascript } from '@codemirror/lang-javascript';
import { type Diagnostic, setDiagnostics } from '@codemirror/lint';
import { EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, gutter } from '@codemirror/view';
import { basicSetup } from 'codemirror';

export type CodeEditor = {
  view: EditorView;
  setDoc(text: string): void;
  getDoc(): string;
  setError(err: { message: string; line: number; column: number } | null): void;
  setBreakpoints(lines: number[]): void;
  /** highlight lines (selection from the graph, or where Play stopped) */
  mark(lines: number[], kind: 'sel' | 'hit'): void;
  destroy(): void;
};

const setBps = StateEffect.define<number[]>();
const bpField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects)
      if (e.is(setBps)) {
        const doc = tr.state.doc;
        set = RangeSet.of(
          e.value
            .filter((l) => l >= 1 && l <= doc.lines)
            .sort((a, b) => a - b)
            .map((l) => bpMarker.range(doc.line(l).from)),
        );
      }
    return set;
  },
});
class BpMarker extends GutterMarker {
  override toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-bp';
    s.textContent = '●';
    return s;
  }
}
const bpMarker = new BpMarker();

const setMarks = StateEffect.define<{ lines: number[]; kind: 'sel' | 'hit' }>();
const markField = StateField.define({
  create: () => ({ sel: [] as number[], hit: [] as number[] }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) v = { ...v, [e.value.kind]: e.value.lines };
    return v;
  },
});
const markDeco = EditorView.decorations.compute([markField], (state) => {
  const v = state.field(markField);
  const doc = state.doc;
  const ranges = [
    ...v.sel
      .filter((l) => l <= doc.lines)
      .map((l) => Decoration.line({ class: 'cm-sel-line' }).range(doc.line(l).from)),
    ...v.hit
      .filter((l) => l <= doc.lines)
      .map((l) => Decoration.line({ class: 'cm-hit-line' }).range(doc.line(l).from)),
  ].sort((a, b) => a.from - b.from);
  return Decoration.set(ranges, true);
});

const theme = EditorView.theme(
  {
    '&': { color: '#d6dce5', backgroundColor: '#0f1216', height: '100%', fontSize: '12.5px' },
    '.cm-content': { fontFamily: '"JetBrains Mono", ui-monospace, monospace', caretColor: '#f2b632' },
    '.cm-gutters': { backgroundColor: '#12161b', color: '#6f7a89', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#1b202866' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: '#3a2f12aa !important' },
    '.cm-sel-line': { backgroundColor: '#1e2530' },
    '.cm-hit-line': { backgroundColor: '#3a2f12' },
    '.cm-bp': { color: '#ff6b6b', cursor: 'pointer', paddingLeft: '3px' },
    '.cm-bp-gutter': { width: '14px', cursor: 'pointer' },
    '.cm-scroller': { overflow: 'auto' },
  },
  { dark: true },
);

export function createCodeEditor(
  parent: HTMLElement,
  doc: string,
  opts: {
    onChange(text: string): void;
    onToggleBreakpoint(line: number): void;
    onCursorLine(line: number): void;
    readOnly: boolean;
  },
): CodeEditor {
  let silent = false;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        gutter({
          class: 'cm-bp-gutter',
          markers: (v) => v.state.field(bpField),
          initialSpacer: () => bpMarker,
          domEventHandlers: {
            mousedown(v, line) {
              opts.onToggleBreakpoint(v.state.doc.lineAt(line.from).number);
              return true;
            },
          },
        }),
        bpField,
        markField,
        markDeco,
        basicSetup,
        javascript(),
        theme,
        EditorState.readOnly.of(opts.readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !silent) opts.onChange(u.state.doc.toString());
          if (u.selectionSet && u.view.hasFocus)
            opts.onCursorLine(u.state.doc.lineAt(u.state.selection.main.head).number);
        }),
      ],
    }),
  });
  return {
    view,
    getDoc: () => view.state.doc.toString(),
    setDoc(text) {
      if (text === view.state.doc.toString()) return;
      silent = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      silent = false;
    },
    setError(err) {
      const diags: Diagnostic[] = [];
      if (err) {
        const doc = view.state.doc;
        const line = doc.line(Math.max(1, Math.min(doc.lines, err.line)));
        const from = Math.min(line.to, line.from + err.column);
        diags.push({ from, to: Math.max(from, line.to), severity: 'error', message: err.message });
      }
      view.dispatch(setDiagnostics(view.state, diags));
    },
    setBreakpoints(lines) {
      view.dispatch({ effects: setBps.of(lines) });
    },
    mark(lines, kind) {
      view.dispatch({ effects: setMarks.of({ lines, kind }) });
    },
    destroy: () => view.destroy(),
  };
}
