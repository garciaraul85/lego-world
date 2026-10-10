import { useMemo, useRef, useState } from 'preact/hooks';
import { type Instances, type MapState, paths } from '../../core/schema';
import type { ActionCtx } from '../actions/registry';
import { CATEGORIES, type CategoryId, groupLabel } from '../categories';

type Row = {
  key: string;
  depth: number;
  name: string;
  meta?: string;
  color?: string;
  caret?: string;
  onClick?: (e: MouseEvent) => void;
  onDbl?: () => void;
  sel?: boolean;
};

const ROW = 26;

/** Fixed-height virtual list: only the visible rows are in the DOM. */
export function VirtualList({ rows, height }: { rows: Row[]; height?: string }) {
  const [top, setTop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const view = ref.current?.clientHeight ?? 600;
  const first = Math.max(0, Math.floor(top / ROW) - 8);
  const last = Math.min(rows.length, Math.ceil((top + view) / ROW) + 8);
  return (
    <div
      class="scroll"
      ref={ref}
      style={{ height }}
      onScroll={(e) => setTop((e.target as HTMLElement).scrollTop)}
      role="tree"
    >
      <div style={{ height: `${rows.length * ROW}px`, position: 'relative' }}>
        {rows.slice(first, last).map((r, i) => (
          <button
            key={r.key}
            type="button"
            role="treeitem"
            aria-selected={!!r.sel}
            class={`tree-row ${r.sel ? 'sel' : ''}`}
            style={{
              position: 'absolute',
              top: `${(first + i) * ROW}px`,
              left: 0,
              right: 0,
              paddingLeft: `${6 + r.depth * 14}px`,
            }}
            onClick={(e) => r.onClick?.(e as unknown as MouseEvent)}
            onDblClick={() => r.onDbl?.()}
          >
            <span class="caret" aria-hidden="true">
              {r.caret ?? ''}
            </span>
            <span class="sw" aria-hidden="true" style={{ background: r.color ?? 'transparent' }} />
            <span class="name">{r.name}</span>
            <span class="meta">{r.meta ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Outliner({ c, className }: { c: ActionCtx; className?: string }) {
  const { ed } = c;
  const tab = ed.left.value;
  return (
    <section class={`panel left ${className ?? ''}`} aria-label="Outliner" data-tour="outliner">
      <div class="ptabs">
        {(
          [
            ['hier', 'Hierarchy'],
            ['layers', 'Layers'],
            ['search', 'Find'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            class={`tab ${tab === id ? 'on' : ''}`}
            onClick={() => {
              ed.left.value = id;
              ed.persistUi();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'hier' && <Hierarchy c={c} />}
      {tab === 'layers' && <Layers c={c} />}
      {tab === 'search' && <Find c={c} />}
      <div style={{ borderTop: '1px solid var(--line)', padding: '8px', display: 'flex', gap: '6px' }}>
        <GroupButton c={c} />
        <button
          type="button"
          class="btn"
          style={{ flex: 1, justifyContent: 'center' }}
          disabled={!ed.selection.value.size || ed.selectionHasAsset.value}
          title="Turn the selected loose bricks into a reusable asset placed here"
          onClick={() => {
            const sel = ed.selectedBricks.value;
            const name = sel[0]?.group ? groupLabel(sel[0].group).replace(/ \d+$/, '') : 'My asset';
            const r = ed.exec({
              type: 'asset.make',
              payload: { map: ed.mapId.value, ids: sel.map((b) => b.id), name },
            });
            if (r.ok) {
              ed.select([]);
              ed.notify(`Made the asset “${name}”. It is in Assets › Assets; edit it in the Asset studio.`);
            }
          }}
        >
          Make asset
        </button>
      </div>
    </section>
  );
}

function GroupButton({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const sel = ed.selectedBricks.value;
  return (
    <button
      type="button"
      class="btn"
      style={{ flex: 1, justifyContent: 'center' }}
      disabled={sel.length < 2}
      title="Make the selected bricks one object (smashed and selected together)"
      onClick={() => {
        const name = `custom-${Date.now().toString(36)}`;
        ed.exec(
          {
            type: 'bricks.update',
            payload: { map: ed.mapId.value, bricks: sel.map((b) => ({ id: b.id, group: name })) },
          },
          { label: 'Group bricks' },
        );
      }}
    >
      Group
    </button>
  );
}

function Hierarchy({ c }: { c: ActionCtx }) {
  const { ed, ui } = c;
  const [open, setOpen] = useState<Record<string, boolean>>({ buildings: true, spawns: true });
  const [filter, setFilter] = useState('');
  const s = ed.scene.value;
  const rev = ed.revision.value;
  const selKey = [...ed.selection.value].slice(0, 3).join(',') + ed.selection.value.size;
  const rows = useMemo((): Row[] => {
    if (!s) return [];
    const m = ed.mapDoc.value!;
    const f = filter.toLowerCase();
    const sel = ed.selection.value;
    const byCat = new Map<CategoryId, { group: string; ids: number[] }[]>();
    const loose = { count: 0, ids: [] as number[] };
    for (const [group, ids] of s.groups) {
      const cat = s.category(s.get(ids[0]!)!);
      const list = byCat.get(cat) ?? [];
      if (!byCat.has(cat)) byCat.set(cat, list);
      list.push({ group, ids });
    }
    for (const { brick } of s.byId.values())
      if (!brick.group) {
        loose.count++;
        loose.ids.push(brick.id);
      }
    const out: Row[] = [
      {
        key: 'map',
        depth: 0,
        name: `${m.name}${m.generator ? ` · ${m.generator.environments.join(' + ')}` : ' · free build'}`,
        color: '#4fd1c5',
        caret: '▾',
        meta: s.count.toLocaleString('en-US'),
      },
      {
        key: 'env',
        depth: 1,
        name: `Sky & weather · ${m.sky.time}${m.weather.rain ? ' · rain' : ''}${m.weather.snowing ? ' · snowing' : m.weather.snow ? ' · snow' : ''}`,
        color: '#a9d2ef',
        onClick: () => (ed.right.value = 'map'),
      },
    ];
    for (const cat of CATEGORIES) {
      if (cat.id === 'terrain') {
        if (!loose.count) continue;
        out.push({
          key: 'terrain',
          depth: 1,
          name: cat.name,
          color: cat.color,
          meta: loose.count.toLocaleString('en-US'),
          onClick: (e) => ed.select(loose.ids, e.shiftKey),
          onDbl: () => ui.frameSelection(),
        });
        continue;
      }
      const groups = (byCat.get(cat.id) ?? []).filter(
        (g) => !f || g.group.includes(f) || groupLabel(g.group).toLowerCase().includes(f),
      );
      if (!groups.length) continue;
      const isOpen = open[cat.id] || !!f;
      out.push({
        key: cat.id,
        depth: 1,
        name: cat.name,
        color: cat.color,
        caret: isOpen ? '▾' : '▸',
        meta: String(groups.length),
        onClick: () => setOpen({ ...open, [cat.id]: !isOpen }),
      });
      if (isOpen)
        for (const g of groups.sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true })))
          out.push({
            key: `g:${g.group}`,
            depth: 2,
            name: groupLabel(g.group),
            color: s.get(g.ids[0]!)?.color,
            meta: String(g.ids.length),
            sel: g.ids.every((id) => sel.has(id)),
            onClick: (e) => ed.select(g.ids, e.shiftKey),
            onDbl: () => ui.frameSelection(),
          });
    }
    const spawnsOpen = open.spawns;
    out.push({
      key: 'spawns',
      depth: 1,
      name: 'Spawn points',
      color: '#4fd1c5',
      caret: spawnsOpen ? '▾' : '▸',
      meta: String(m.spawns.length),
      onClick: () => setOpen({ ...open, spawns: !spawnsOpen }),
    });
    if (spawnsOpen)
      for (const sp of m.spawns)
        out.push({
          key: `sp:${sp.id}`,
          depth: 2,
          name: `${sp.name}${ed.store.manifest.entry.spawn === sp.id ? ' · start' : ''}`,
          color: '#4fd1c5',
          sel: ed.selectedSpawn.value === sp.id,
          onClick: () => {
            ed.select([]);
            ed.selectedSpawn.value = sp.id;
            ed.right.value = 'inspect';
          },
        });
    const inst = ed.store.get<Instances>(paths.instances(m.id));
    const npcs = inst?.items.filter((i) => i.kind === 'npc').length ?? 0;
    out.push({
      key: 'npcs',
      depth: 1,
      name: inst?.npcsSaved ? 'Neighbors' : 'Neighbors · created by v68 on first play',
      color: '#f2b632',
      meta: String(npcs),
      onClick: () => ed.notify('Neighbors are edited in LEGO World v68 for now (Play menu → Open in LEGO World v68).'),
    });
    const broken = ed.store.get<MapState>(paths.state(m.id))?.broken.length ?? 0;
    if (broken)
      out.push({ key: 'broken', depth: 1, name: 'Smashed (rebuildable)', color: '#ef5a5a', meta: String(broken) });
    return out;
  }, [s, rev, selKey, open, filter, ed.selectedSpawn.value]);
  return (
    <>
      <div style={{ padding: '8px' }}>
        <input
          class="inp"
          aria-label="Filter hierarchy"
          placeholder="Filter: house, tree, car…"
          value={filter}
          onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
        />
      </div>
      <VirtualList rows={rows} />
    </>
  );
}

function Layers({ c }: { c: ActionCtx }) {
  const { ed } = c;
  const s = ed.scene.value;
  ed.revision.value;
  const counts = new Map<CategoryId, number>();
  if (s)
    for (const { brick } of s.byId.values()) counts.set(s.category(brick), (counts.get(s.category(brick)) ?? 0) + 1);
  return (
    <div class="scroll" style={{ padding: '6px 4px' }}>
      {CATEGORIES.map((cat) => {
        const l = ed.layers.value[cat.id];
        return (
          <div class="layer-row">
            <button
              type="button"
              class={`tog ${l.visible ? 'on' : ''}`}
              aria-pressed={l.visible}
              aria-label={`Show ${cat.name}`}
              onClick={() => ed.setLayer(cat.id, { visible: !l.visible })}
            >
              ◉
            </button>
            <button
              type="button"
              class={`tog lock ${l.locked ? 'on' : ''}`}
              aria-pressed={l.locked}
              aria-label={`Lock ${cat.name}`}
              onClick={() => ed.setLayer(cat.id, { locked: !l.locked })}
            >
              ▣
            </button>
            <span
              aria-hidden="true"
              style={{ width: '10px', height: '10px', borderRadius: '2px', background: cat.color }}
            />
            <span style={l.visible ? undefined : { color: '#6f7a89' }}>{cat.name}</span>
            <span class="mono small" style={{ color: 'var(--mut2)' }}>
              {(counts.get(cat.id) ?? 0).toLocaleString('en-US')}
            </span>
          </div>
        );
      })}
      <p class="hint" style={{ padding: '8px 8px 0' }}>
        Hidden layers stay in the game; they are only hidden while editing. Locked layers can’t be selected or edited
        with the mouse.
      </p>
    </div>
  );
}

function Find({ c }: { c: ActionCtx }) {
  const { ed, ui } = c;
  const [q, setQ] = useState('');
  const s = ed.scene.value;
  ed.revision.value;
  const results = useMemo(() => {
    if (!s || !q.trim()) return [];
    const t = q.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(t)) {
      const ids = [...s.byId.values()].filter(({ brick }) => brick.color === t).map(({ brick }) => brick.id);
      return ids.length ? [{ name: `Bricks colored ${t}`, ids }] : [];
    }
    return [...s.groups]
      .filter(([g]) => g.includes(t) || groupLabel(g).toLowerCase().includes(t))
      .slice(0, 200)
      .map(([g, ids]) => ({ name: groupLabel(g), ids }));
  }, [s, q, ed.revision.value]);
  return (
    <div class="scroll" style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <input
        class="inp"
        aria-label="Find in map"
        placeholder="house, tree, car, or a color like #d20c20"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />
      <div class="muted small">
        {q
          ? `${results.length} result${results.length === 1 ? '' : 's'} in ${ed.mapDoc.value?.name}`
          : 'Search object names or a brick color.'}
      </div>
      {results.length > 1 && (
        <button type="button" class="btn" onClick={() => ed.select(results.flatMap((r) => r.ids))}>
          Select all results
        </button>
      )}
      {results.map((r) => (
        <button
          type="button"
          class="tree-row"
          style={{ background: 'var(--panel2)', padding: '0 8px' }}
          onClick={(e) => ed.select(r.ids, e.shiftKey)}
          onDblClick={() => {
            ed.select(r.ids);
            ui.frameSelection();
          }}
        >
          <span class="name">{r.name}</span>
          <span class="meta">{r.ids.length}</span>
        </button>
      ))}
    </div>
  );
}
