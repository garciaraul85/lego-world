import { useEffect, useRef, useState } from 'preact/hooks';
import { ACCEPT, GAME_BUDGET_BYTES, isBigPicture, type MediaKind } from '../../core/media/import';
import { mediaTotals, mediaUses, sizeText } from '../../core/media/uses';
import { type MediaIndex, paths } from '../../core/schema';
import { endDrag, startDrag } from '../interact/drag';
import { importFiles as importAll, setShrinkOnImport, shrinkOnImport } from '../media/import-files';
import { shrinkMedia } from '../media/shrink';
import type { EditorState } from '../state';

type Item = MediaIndex['items'][string];
const KINDS: { kind: MediaKind; label: string; icon: string }[] = [
  { kind: 'image', label: 'Pictures', icon: '🖼' },
  { kind: 'video', label: 'Videos', icon: '🎬' },
  { kind: 'audio', label: 'Sounds', icon: '🔊' },
  { kind: 'model', label: '3D models', icon: '🧊' },
  { kind: 'font', label: 'Fonts', icon: '🔤' },
];
const ICON = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon])) as Record<MediaKind, string>;
/** licences people pick most; any other can be typed */
export const LICENSES = ['My own work', 'CC0 (public domain)', 'CC BY 4.0', 'CC BY-SA 4.0', 'Used with permission'];

/**
 * Step 11 (P24 part 3): the Media library (File › Media library…) — every file the game imported (pictures, videos,
 * sounds, 3D models, fonts): how much of the 300 MB budget they take (going over warns; a shared game is split into
 * parts), where each is used, its name and who made it (the
 * credits), shrinking big pictures, and removing what nothing uses.
 */
export function MediaLibrary({ ed, onClose }: { ed: EditorState; onClose(): void }) {
  void ed.revision.value;
  const index = ed.store.get<MediaIndex>(paths.media);
  const items = Object.entries(index?.items ?? {}) as [string, Item][];
  const [kind, setKind] = useState<MediaKind | 'all'>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [shrinkIn, setShrinkIn] = useState(shrinkOnImport());
  // while a file is dragged out, the library steps aside so it can be dropped on what is behind it
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const totals = mediaTotals(index);
  const uses = new Map(items.map(([ref]) => [ref, mediaUses(ed.store, ref)]));
  const shown = items
    .filter(([, m]) => kind === 'all' || m.kind === kind)
    .filter(([, m]) => !q || m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b[1].bytes - a[1].bytes);
  const unused = items.filter(([ref]) => !uses.get(ref)?.length);
  const big = items.filter(([, m]) => isBigPicture(m));
  const cur = sel ? index?.items[sel] : undefined;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => {
    if (sel && !index?.items[sel]) setSel(null);
  });

  const importFiles = async (fl: FileList) => {
    setBusy('Importing…');
    const out = await importAll(ed, [...fl], { shrink: shrinkIn });
    setBusy('');
    const last = [...out].reverse().find((r) => r.ok);
    if (last?.ok) setSel(last.ref);
  };

  /** a smaller copy takes the big picture's place everywhere it is used */
  const shrink = async (ref: string): Promise<boolean> => {
    const to = await shrinkMedia(ed, ref);
    if (to && sel === ref) setSel(to);
    return !!to;
  };
  const shrinkAll = async () => {
    setBusy('Shrinking…');
    let n = 0;
    for (const [ref] of big) if (await shrink(ref)) n++;
    setBusy('');
    if (n > 1) ed.notify(`${n} pictures shrunk. Undo puts each back.`);
  };
  const removeUnused = () => {
    const r = ed.exec(
      unused.map(([ref]) => ({ type: 'media.remove', payload: { ref } })),
      { label: `Remove ${unused.length} unused files` },
    );
    if (r.ok)
      ed.notify(`Removed ${unused.length} unused files (${sizeText(unused.reduce((n, [, m]) => n + m.bytes, 0))}).`);
  };

  const pct = Math.min(100, (totals.bytes / GAME_BUDGET_BYTES) * 100);
  const over = totals.bytes > GAME_BUDGET_BYTES;
  return (
    <div
      class={`fp-back${dragging ? ' media-lib-away' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Media library"
      data-help="media.library"
    >
      <div class="fp media-lib">
        <header class="fp-head">
          <b>🗂 Media library</b>
          <span class="muted small" style={{ marginLeft: '10px' }}>
            {items.length} files · {sizeText(totals.bytes)} of 300 MB
          </span>
          <span style={{ flex: 1 }} />
          <label
            class="row small"
            title="A picture wider or taller than 2048 pixels, over 1 MB, or a BMP is made smaller as it comes in"
          >
            <input
              type="checkbox"
              checked={shrinkIn}
              data-tour="media-shrink-in"
              onChange={(e) => {
                const on = (e.target as HTMLInputElement).checked;
                setShrinkIn(on);
                setShrinkOnImport(on);
              }}
            />
            Shrink big pictures as they come in
          </label>
          <button
            type="button"
            class="btn on small"
            data-tour="media-import"
            disabled={!!busy}
            onClick={() => file.current?.click()}
          >
            {busy || 'Import files…'}
          </button>
          <input
            ref={file}
            type="file"
            hidden
            multiple
            accept={ACCEPT}
            aria-label="Files to import"
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              if (input.files?.length) void importFiles(input.files);
              input.value = '';
            }}
          />
          <button type="button" class="btn small" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div class="media-budget" data-tour="media-budget" title={`${sizeText(totals.bytes)} of 300 MB`}>
          <div
            class="media-budget-bar"
            role="meter"
            aria-label="Media budget"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            {KINDS.map((k) =>
              totals.by[k.kind] ? (
                <span
                  class={`media-seg media-${k.kind}`}
                  style={{ width: `${(totals.by[k.kind]!.bytes / Math.max(GAME_BUDGET_BYTES, totals.bytes)) * 100}%` }}
                  title={`${k.label}: ${sizeText(totals.by[k.kind]!.bytes)}`}
                />
              ) : null,
            )}
          </div>
          <div class="row small" style={{ gap: '10px', flexWrap: 'wrap' }}>
            {KINDS.filter((k) => totals.by[k.kind]).map((k) => (
              <span class="row" style={{ gap: '4px' }}>
                <span class={`media-dot media-${k.kind}`} />
                {k.label} {sizeText(totals.by[k.kind]!.bytes)}
              </span>
            ))}
            <span style={{ flex: 1 }} />
            {over ? (
              <span class="media-warn" role="status">
                Over 300 MB: it still works here; when shared, the game is split into parts. Shrink pictures or remove
                unused files to stay under.
              </span>
            ) : (
              pct > 80 && <span class="media-warn">Nearly 300 MB: shrink pictures or remove unused files.</span>
            )}
          </div>
        </div>
        <div class="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
          <div class="row" role="radiogroup" aria-label="Show" style={{ gap: '4px' }}>
            {[{ kind: 'all' as const, label: 'All', icon: '' }, ...KINDS].map((k) => (
              <button
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                class={`btn small ${kind === k.kind ? 'on' : ''}`}
                data-tour={`media-kind-${k.kind}`}
                onClick={() => setKind(k.kind)}
              >
                {k.icon} {k.label}
              </button>
            ))}
          </div>
          <input
            class="inp"
            placeholder="Find a file"
            aria-label="Find a file"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            style={{ width: '160px' }}
          />
          <span style={{ flex: 1 }} />
          <button
            type="button"
            class="btn small"
            data-tour="media-shrink-all"
            disabled={!big.length || !!busy}
            title="Make every big picture smaller (at most 2048 pixels, WebP); undo puts them back"
            onClick={() => void shrinkAll()}
          >
            Shrink big pictures ({big.length})
          </button>
          <button
            type="button"
            class="btn small"
            data-tour="media-remove-unused"
            disabled={!unused.length}
            onClick={removeUnused}
          >
            Remove unused ({unused.length})
          </button>
        </div>
        <div class="media-body">
          <div class="media-list" role="listbox" aria-label="Media files" data-tour="media-list">
            {!shown.length && (
              <p class="muted small" style={{ padding: '12px' }}>
                {items.length
                  ? 'No file matches.'
                  : 'Nothing imported yet. Import files… takes pictures (.png .jpg .webp .gif .avif .bmp .svg), videos (.mp4 .webm), sounds (.wav .mp3 .ogg .m4a), 3D models (.glb .gltf) and fonts.'}
              </p>
            )}
            {shown.map(([ref, m]) => {
              const n = uses.get(ref)?.length ?? 0;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={sel === ref}
                  class={`media-row ${sel === ref ? 'on' : ''}`}
                  data-tour={`media-row-${ref.slice(7, 17)}`}
                  draggable
                  title="Drag it onto a screen widget, a button, the cutscene timeline or (a 3D model) the Scene"
                  onDragStart={(e) => {
                    startDrag(e as unknown as DragEvent, {
                      kind: 'media',
                      ref,
                      media: m.kind as MediaKind,
                      name: m.name,
                    });
                    // after the browser has taken its drag picture
                    setTimeout(() => setDragging(true), 0);
                  }}
                  onDragEnd={() => {
                    endDrag();
                    setDragging(false);
                  }}
                  onClick={() => setSel(ref)}
                >
                  <Thumb ed={ed} r={ref} m={m} size={44} />
                  <span class="media-row-text">
                    <span class="media-name">{m.name}</span>
                    <span class="muted small">{facts(m)}</span>
                  </span>
                  <span class="media-row-side small">
                    <span>{sizeText(m.bytes)}</span>
                    {isBigPicture(m) && <span class="media-tag big">big</span>}
                    {!n && <span class="media-tag">unused</span>}
                    {m.credit && <span class="media-tag credit">credited</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div class="media-detail" data-tour="media-detail">
            {cur && sel ? (
              <Detail
                key={sel}
                ed={ed}
                r={sel}
                m={cur}
                uses={uses.get(sel) ?? []}
                onShrink={() => {
                  setBusy('Shrinking…');
                  void shrink(sel).finally(() => setBusy(''));
                }}
              />
            ) : (
              <p class="muted small">
                Pick a file to see it, where it is used, rename it or say who made it. Files with a credit are listed by
                a Credits widget on any screen.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function facts(m: Item): string {
  const f: string[] = [m.mime.split('/')[1]!.replace('svg+xml', 'svg').replace('mpeg', 'mp3').toUpperCase()];
  if (m.w && m.h) f.push(`${m.w}×${m.h}`);
  if (m.duration) f.push(`${m.duration.toFixed(1)} s`);
  if (m.animated) f.push('animated');
  if (m.triangles) f.push(`${m.triangles.toLocaleString()} triangles`);
  return f.join(' · ');
}

function Thumb({ ed, r, m, size }: { ed: EditorState; r: string; m: Item; size: number }) {
  const url = ed.media?.url(r);
  const box = { width: `${size}px`, height: `${size}px` };
  if (url && m.kind === 'image') return <img class="media-thumb" src={url} alt="" style={box} />;
  if (url && m.kind === 'video')
    return <video class="media-thumb" src={`${url}#t=0.5`} muted preload="metadata" style={box} />;
  return (
    <span class="media-thumb icon" style={{ ...box, fontSize: `${size * 0.5}px` }} aria-hidden="true">
      {ICON[m.kind as MediaKind] ?? '📄'}
    </span>
  );
}

function Detail({
  ed,
  r,
  m,
  uses,
  onShrink,
}: {
  ed: EditorState;
  r: string;
  m: Item;
  uses: { path: string; what: string }[];
  onShrink(): void;
}) {
  const url = ed.media?.url(r);
  const [name, setName] = useState(m.name);
  const [author, setAuthor] = useState(m.credit?.author ?? '');
  const [license, setLicense] = useState(m.credit?.license ?? '');
  const [link, setLink] = useState(m.credit?.link ?? '');
  const saveName = () => {
    if (name.trim() && name !== m.name)
      ed.exec({ type: 'media.update', payload: { ref: r, name } }, { label: 'Rename media' });
  };
  const saveCredit = (patch: { author?: string; license?: string; link?: string }) => {
    const c = { author, license, link, ...patch };
    const r2 = ed.exec(
      { type: 'media.update', payload: { ref: r, credit: { author: c.author, license: c.license, link: c.link } } },
      { label: `Credit ${m.name}` },
    );
    if (!r2.ok) ed.notify(r2.error ?? 'It could not be saved.', true);
  };
  return (
    <div class="col" style={{ gap: '8px' }}>
      <div class="media-preview">
        {url && m.kind === 'image' && <img src={url} alt={m.name} />}
        {url && m.kind === 'video' && <video src={url} controls muted playsInline aria-label={`Video ${m.name}`} />}
        {url && m.kind === 'audio' && (
          // biome-ignore lint/a11y/useMediaCaption: a preview of the maker's own file, which has no captions
          <audio src={url} controls aria-label={`Sound ${m.name}`} />
        )}
        {(!url || m.kind === 'font' || m.kind === 'model') && (
          <span style={{ fontSize: '48px' }} aria-hidden="true">
            {ICON[m.kind as MediaKind]}
          </span>
        )}
      </div>
      <span class="muted small">
        {facts(m)} · {sizeText(m.bytes)}
      </span>
      <label class="field">
        Name
        <input
          class="inp"
          value={name}
          maxLength={120}
          data-tour="media-name"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && saveName()}
        />
      </label>
      <fieldset class="media-credit" data-tour="media-credit">
        <legend>Who made it</legend>
        <label class="field">
          Author
          <input
            class="inp"
            value={author}
            maxLength={80}
            placeholder="Your name, or the artist's"
            data-tour="media-author"
            onInput={(e) => setAuthor((e.target as HTMLInputElement).value)}
            onBlur={() => saveCredit({})}
          />
        </label>
        <label class="field">
          Licence
          <input
            class="inp"
            value={license}
            maxLength={60}
            list="media-licenses"
            placeholder="e.g. CC BY 4.0"
            data-tour="media-license"
            onInput={(e) => setLicense((e.target as HTMLInputElement).value)}
            onChange={(e) => saveCredit({ license: (e.target as HTMLInputElement).value })}
          />
          <datalist id="media-licenses">
            {LICENSES.map((l) => (
              <option value={l} />
            ))}
          </datalist>
        </label>
        <label class="field">
          Link (where it came from)
          <input
            class="inp"
            value={link}
            maxLength={300}
            placeholder="https://…"
            data-tour="media-link"
            onInput={(e) => setLink((e.target as HTMLInputElement).value)}
            onBlur={() => saveCredit({})}
          />
        </label>
        <span class="muted small">A Credits widget on a screen lists every file with a credit.</span>
      </fieldset>
      <div class="field">
        Used by
        {uses.length ? (
          <ul class="media-uses">
            {uses.map((u) => (
              <li>{u.what}</li>
            ))}
          </ul>
        ) : (
          <span class="muted small">Nothing uses it yet.</span>
        )}
      </div>
      <div class="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
        {isBigPicture(m) && (
          <button
            type="button"
            class="btn small on"
            data-tour="media-shrink"
            title="At most 2048 pixels, saved as WebP; everything using it uses the smaller copy (undo puts it back)"
            onClick={onShrink}
          >
            Shrink it
          </button>
        )}
        <button
          type="button"
          class="btn small danger"
          data-tour="media-remove"
          disabled={uses.length > 0}
          title={uses.length ? 'Something still uses it' : ''}
          onClick={() => ed.exec({ type: 'media.remove', payload: { ref: r } }, { label: `Remove ${m.name}` })}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
