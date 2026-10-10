import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type ParseError, parseCode } from '../../../core/logic/code/parse';
import { PrintError, printGraph } from '../../../core/logic/code/print';
import type { LogicGraph } from '../../../core/schema';
import type { EditorState } from '../../state';
import type { CodeEditor } from './codemirror';
import { toggleBreakpoint } from './GraphView';

/**
 * The same graph as script (P4.4). Edits are parsed as you type; a valid script replaces the graph
 * (one undo step), an invalid one shows the error at its line. Clicking a line selects its nodes in
 * the graph; the gutter toggles breakpoints.
 */
export function CodeView({
  ed,
  graph,
  selected,
  setSelected,
  highlight,
}: {
  ed: EditorState;
  graph: LogicGraph;
  selected: ReadonlySet<string>;
  setSelected: (s: Set<string>) => void;
  highlight: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cm = useRef<CodeEditor | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [loading, setLoading] = useState(true);
  const printed = useMemo(() => {
    try {
      return { ok: true as const, ...printGraph(graph) };
    } catch (e) {
      if (e instanceof PrintError) return { ok: false as const, message: e.message, node: e.node };
      throw e;
    }
  }, [graph]);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const printedRef = useRef(printed);
  printedRef.current = printed;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bps = ed.breakpoints.value;

  const apply = (text: string) => {
    const g = graphRef.current;
    const r = parseCode(text, g);
    if ('error' in r) {
      setError(r.error);
      cm.current?.setError(r.error);
      return;
    }
    setError(null);
    cm.current?.setError(null);
    const before = printGraph(g).code;
    const after = printGraph(r).code;
    if (before === after && r.edges.length === g.edges.length) return;
    // keep notes and unprinted nodes the script does not mention? Script is the whole graph.
    ed.exec(
      { type: 'logic.replace', payload: { graph: { ...g, nodes: r.nodes, edges: r.edges } } },
      { label: 'Edit logic as code' },
    );
  };

  useEffect(() => {
    let alive = true;
    void import('./codemirror').then(({ createCodeEditor }) => {
      if (!alive || !host.current) return;
      const p = printedRef.current;
      cm.current = createCodeEditor(host.current, p.ok ? p.code : `// ${p.message}\n`, {
        readOnly: !p.ok,
        onChange: (text) => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply(text), 450);
        },
        onToggleBreakpoint: (line) => {
          const pr = printedRef.current;
          if (!pr.ok) return;
          const node = [...pr.line].find(([id, l]) => l === line && !id.startsWith('note'))?.[0];
          if (node) toggleBreakpoint(ed, graphRef.current.id, node);
        },
        onCursorLine: (line) => {
          const pr = printedRef.current;
          if (!pr.ok) return;
          const ids = [...pr.line].filter(([, l]) => l === line).map(([id]) => id);
          if (ids.length) setSelected(new Set(ids));
        },
      });
      setLoading(false);
    });
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      cm.current?.destroy();
      cm.current = null;
    };
  }, [graph.id]);

  // the graph changed elsewhere (graph view, undo): show the new script unless the user is typing
  useEffect(() => {
    const c = cm.current;
    if (!c || !printed.ok) return;
    if (c.view.hasFocus && (timer.current || error)) return;
    c.setDoc(printed.code);
  }, [printed]);

  useEffect(() => {
    const c = cm.current;
    if (!c || !printed.ok) return;
    const lines = [...bps]
      .filter((k) => k.startsWith(`${graph.id}:`))
      .map((k) => printed.line.get(k.split(':')[1]!))
      .filter((l): l is number => !!l);
    c.setBreakpoints(lines);
    c.mark(
      [...selected].map((id) => printed.line.get(id)).filter((l): l is number => !!l),
      'sel',
    );
    c.mark(highlight && printed.line.get(highlight) ? [printed.line.get(highlight)!] : [], 'hit');
  }, [bps, selected, highlight, printed, loading]);

  return (
    <div class="lg-code">
      {!printed.ok && (
        <div class="lg-code-note" role="status">
          {printed.message}
        </div>
      )}
      {printed.ok && printed.unprinted.length > 0 && (
        <div class="lg-code-note" role="status">
          {printed.unprinted.length} node{printed.unprinted.length === 1 ? ' is' : 's are'} not connected to an event
          and not shown here; editing the code removes {printed.unprinted.length === 1 ? 'it' : 'them'}.
        </div>
      )}
      {loading && (
        <div class="muted small" style={{ padding: '10px' }}>
          Loading the code editor…
        </div>
      )}
      <div ref={host} class="lg-cm" />
      <div class={`lg-code-status small ${error ? 'err' : ''}`} role="status">
        {error
          ? `Line ${error.line}: ${error.message}`
          : 'Script and graph are in sync. Click the gutter to set a breakpoint.'}
      </div>
    </div>
  );
}
