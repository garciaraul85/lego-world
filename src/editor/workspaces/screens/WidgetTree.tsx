import type { Widget } from '../../../core/schema';

const ICON: Record<Widget['type'], string> = {
  panel: '▢',
  text: 'T',
  image: '🖼',
  button: '⏺',
  hearts: '♥',
  bar: '▬',
  list: '☰',
  dialogue: '💬',
  minimap: '◩',
  slot: '⬚',
};

/** The widget tree of one screen; tree order is also keyboard / gamepad focus order. */
export function WidgetTree({
  root,
  selected,
  onSelect,
}: {
  root: Widget;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const rows: { w: Widget; path: string; depth: number }[] = [];
  const walk = (w: Widget, path: string, depth: number) => {
    rows.push({ w, path, depth });
    const kids = w.children ?? [];
    for (let i = 0; i < kids.length; i++) walk(kids[i]!, path === '' ? String(i) : `${path}.${i}`, depth + 1);
  };
  walk(root, '', 0);
  return (
    <div role="tree" aria-label="Widgets" class="sc-tree">
      {rows.map((r) => (
        <button
          type="button"
          role="treeitem"
          aria-selected={selected === r.path}
          class={`lib-item ${selected === r.path ? 'on' : ''}`}
          style={{ paddingLeft: `${10 + r.depth * 14}px` }}
          onClick={() => onSelect(r.path)}
        >
          <span class="mono small muted" aria-hidden="true">
            {ICON[r.w.type]}
          </span>
          <span class="asset-name">{r.path === '' ? 'Screen' : (r.w.id ?? r.w.type)}</span>
          <span class="mono small muted">{r.w.type}</span>
        </button>
      ))}
    </div>
  );
}
