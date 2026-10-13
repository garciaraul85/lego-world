import { useRef } from 'preact/hooks';
import { encodePixels, GLYPH_SET } from '../../../../core/art/render';
import { starterGlyphs } from '../../../../core/art/ttf';
import type { Command } from '../../../../core/commands';
import { newId } from '../../../../core/ids';
import { ACCEPT_OF, importMedia } from '../../../../core/media/import';
import { type Art, type MediaIndex, paths } from '../../../../core/schema';
import type { EditorState } from '../../../state';
import { artFont, artUrl } from './render';

export type ArtKind = Art['kind'];

export const allArt = (ed: EditorState): Art[] =>
  ed.store
    .list(paths.artDir)
    .map((p) => ed.store.get<Art>(p)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

const blankPixels = (w: number, h: number) =>
  encodePixels(Array.from({ length: h }, () => Array.from({ length: w }, () => -1)));

/** New art files, ready to edit. */
export function newArt(kind: ArtKind, how: 'generate' | 'draw' | 'design', n: number): Art {
  const id = newId('art') as Art['id'];
  if (kind === 'font')
    return {
      id,
      name: `Pixel font ${n}`,
      kind,
      source: { type: 'pixelFont', cellW: 6, cellH: 9, baseline: 7, spacing: 1, glyphs: starterGlyphs() },
    };
  if (how === 'generate')
    return {
      id,
      name: `Background ${n}`,
      kind,
      source: { type: 'pattern', pattern: 'linear', colors: ['#2b5876', '#4e4376'], angle: 160, scale: 48 },
    };
  const [w, h] = kind === 'icon' ? [24, 24] : [128, 72];
  return {
    id,
    name: `${kind === 'icon' ? 'Icon' : 'Drawing'} ${n}`,
    kind,
    source: {
      type: 'pixels',
      w,
      h,
      palette: ['#000000', '#ffffff', '#d20c20', '#f7c900', '#2f8f46', '#0a5ec4', '#8a5a2b', '#9aa4b2'],
      data: blankPixels(w, h),
    },
  };
}

const KINDS: {
  kind: ArtKind;
  title: string;
  make: { how: 'generate' | 'draw' | 'design'; label: string; tip: string }[];
}[] = [
  {
    kind: 'background',
    title: 'Backgrounds',
    make: [
      { how: 'generate', label: 'Generate', tip: 'Make a background from a pattern and colours' },
      { how: 'draw', label: 'Draw', tip: 'Draw a pixel background' },
    ],
  },
  { kind: 'icon', title: 'Icons', make: [{ how: 'draw', label: 'Draw', tip: 'Draw a pixel icon' }] },
  {
    kind: 'font',
    title: 'Fonts',
    make: [{ how: 'design', label: 'Design', tip: 'Design a pixel font letter by letter' }],
  },
];

/**
 * P31 art library (Screens workspace, Art tab): backgrounds, icons and fonts — imported from the computer,
 * generated, drawn or designed. Click one to edit it in the middle.
 */
export function ArtLibrary({
  ed,
  open,
  onOpen,
}: {
  ed: EditorState;
  open: string | null;
  onOpen: (id: string) => void;
}) {
  ed.revision.value;
  const list = allArt(ed);
  const files = useRef<HTMLInputElement>(null);
  const importKind = useRef<ArtKind>('background');
  const create = (kind: ArtKind, how: 'generate' | 'draw' | 'design') => {
    const art = newArt(kind, how, list.filter((a) => a.kind === kind).length + 1);
    if (ed.exec({ type: 'art.put', payload: { art } }, { label: `New ${kind}` }).ok) onOpen(art.id);
  };
  const importFiles = async (fl: FileList) => {
    let last: string | null = null;
    for (const f of [...fl]) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const r = await importMedia(f.name, bytes, { index: ed.store.get<MediaIndex>(paths.media) });
      if (!r.ok) {
        ed.notify(r.error, true);
        continue;
      }
      const kind = importKind.current;
      if ((kind === 'font') !== (r.entry.kind === 'font')) {
        ed.notify(`${f.name} is not ${kind === 'font' ? 'a font' : 'a picture'}.`, true);
        continue;
      }
      ed.media?.put(r.ref, new Blob([bytes], { type: r.entry.mime }));
      const name = f.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Imported';
      const art: Art = {
        id: newId('art') as Art['id'],
        name,
        kind,
        source: kind === 'font' ? { type: 'fontFile', media: r.ref, family: name } : { type: 'image', media: r.ref },
      };
      const cmds: Command[] = [];
      if (!r.duplicate) cmds.push({ type: 'media.register', payload: { ref: r.ref, entry: r.entry } });
      cmds.push({ type: 'art.put', payload: { art } });
      if (ed.exec(cmds, { label: `Import ${name}` }).ok) last = art.id;
    }
    if (last) onOpen(last);
  };
  return (
    <div class="art-lib" data-tour="art-library">
      <input
        ref={files}
        type="file"
        hidden
        multiple
        onChange={(e) => {
          const input = e.target as HTMLInputElement;
          if (input.files?.length) void importFiles(input.files);
          input.value = '';
        }}
      />
      {KINDS.map((k) => (
        <section class="art-group" aria-label={k.title}>
          <div class="sech" style={{ padding: '8px 10px 4px' }}>
            <span>
              {k.title} · {list.filter((a) => a.kind === k.kind).length}
            </span>
          </div>
          <div class="row" style={{ padding: '0 10px 6px', gap: '4px', flexWrap: 'wrap' }}>
            <button
              type="button"
              class="btn"
              data-tip={`Import ${k.kind === 'font' ? 'a font (.ttf .otf .woff .woff2)' : 'a picture (.png .jpg .webp .svg)'} from your computer`}
              onClick={() => {
                importKind.current = k.kind;
                files.current!.accept = ACCEPT_OF(k.kind === 'font' ? 'font' : 'image');
                files.current!.click();
              }}
            >
              ⤓ Import
            </button>
            {k.make.map((m) => (
              <button type="button" class="btn" data-tip={m.tip} onClick={() => create(k.kind, m.how)}>
                + {m.label}
              </button>
            ))}
          </div>
          <div class="art-cards">
            {list
              .filter((a) => a.kind === k.kind)
              .map((a) => (
                <button
                  type="button"
                  class={`art-card ${open === a.id ? 'on' : ''}`}
                  aria-label={`${a.name} (${k.kind})`}
                  onClick={() => onOpen(a.id)}
                >
                  <ArtThumb ed={ed} art={a} />
                  <span class="small art-name">{a.name}</span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A small picture of an art file: the picture itself, or "Aa" in the font. */
export function ArtThumb({ ed, art, size = 56 }: { ed: EditorState; art: Art; size?: number }) {
  if (art.kind === 'font') {
    const ff = artFont(ed, `art:${art.id}`);
    return (
      <span
        class="art-thumb font"
        style={{ width: `${size}px`, height: `${size}px`, fontFamily: ff }}
        aria-hidden="true"
      >
        Aa
      </span>
    );
  }
  const url = artUrl(ed, art.id);
  return (
    <span
      class={`art-thumb ${art.kind}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: url ? `url("${url}")` : 'none',
        backgroundSize: art.kind === 'icon' ? 'contain' : 'cover',
      }}
      aria-hidden="true"
    />
  );
}

/** Letters a pixel font offers, for its designer. */
export const FONT_LETTERS = GLYPH_SET;
