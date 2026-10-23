import { useEffect, useRef, useState } from 'preact/hooks';
import { type ResolvedBody, resolveBody } from '../../../core/character/resolve';
import { newId } from '../../../core/ids';
import type { Character } from '../../../core/schema';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { sessionKey } from '../../../platform/ai/keys';
import { type AiSettings, gameSpent, loadAi, recordSpend, saveAi } from '../../../platform/ai/settings';
import type { ActionCtx } from '../../actions/registry';
import { pickProvider } from '../../ai/providers';
import { aiPrompt, type Candidate, type Catalog, localCandidates, mainColors, parseCandidates } from './picture-match';
import { CharacterThumb } from './thumbs';

/**
 * P22 part 4: “From a picture” — a picture or drawing, or a few words, becomes three characters to pick from,
 * each made only of editor settings (a body family, or minifig parts and colours), with what each part
 * matched. The picture is sent to Claude only when Create is pressed, and is never saved in the game.
 */
const withKey = (s: AiSettings): AiSettings => (s.apiKey ? s : { ...s, apiKey: sessionKey() ?? '' });

export function catalog(): Catalog {
  const L = legacyRuntime();
  return {
    choices: L.CharacterCatalog.choices as Record<string, string[]>,
    colorFields: L.CharacterCatalog.colorFields,
  };
}

async function readPicture(
  file: File,
): Promise<{ url: string; colors: string[]; blob: Blob; base64: string; mediaType: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  // a small copy: enough for colours, and a light picture to send
  const k = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.drawImage(img, 0, 0, w, h);
  const colors = mainColors(g.getImageData(0, 0, w, h).data, w, h, 4);
  const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  const dataUrl = cv.toDataURL('image/jpeg', 0.85);
  return { url, colors, blob, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' };
}

type Picture = Awaited<ReturnType<typeof readPicture>>;

export function FromPicture({ c, onClose }: { c: ActionCtx; onClose(): void }) {
  const ed = c.ed;
  const [pic, setPic] = useState<Picture | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<AbortController | null>(null);
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [reading, setReading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void pickProvider(() => withKey(loadAi())).then((p) => setAiReady(!!p));
    box.current?.querySelector('textarea')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => () => (pic ? URL.revokeObjectURL(pic.url) : undefined), [pic]);

  const choose = async (f: File | null | undefined) => {
    if (!f || !f.type.startsWith('image/')) return;
    setReading(true);
    try {
      setPic(await readPicture(f));
      setFound(null);
      setStatus('');
    } catch {
      setStatus('That picture could not be read. Try a PNG or JPEG.');
    } finally {
      setReading(false);
    }
  };

  const create = async () => {
    const cat = catalog();
    const colors = pic?.colors ?? [];
    const local = () => localCandidates(text, colors, cat);
    const s = withKey(loadAi());
    const capped =
      (s.dailyCap > 0 && s.spent.tokens >= s.dailyCap) ||
      (s.gameCap > 0 && gameSpent(s, ed.store.manifest.id) >= s.gameCap);
    const provider = capped ? null : await pickProvider(() => s);
    if (!provider) {
      setFound(local());
      setStatus(
        capped
          ? 'Made by the editor on its own (today’s AI spending cap is reached).'
          : 'Made by the editor on its own: the words pick the kind and the parts, the picture gives the colours. Set up the AI builder for Claude to look at the picture too.',
      );
      return;
    }
    const ctl = new AbortController();
    setBusy(ctl);
    setStatus('Claude is looking…');
    try {
      const r = await provider.run({
        instructions: 'You choose settings for a character in a brick game editor. Answer with JSON only.',
        turns: [{ role: 'user', content: aiPrompt(text, !!pic, cat, colors) }],
        tools: [],
        maxRounds: 1,
        maxTokens: 3000,
        signal: ctl.signal,
        ...(pic ? { images: [{ blob: pic.blob, mediaType: pic.mediaType, base64: pic.base64 }] } : {}),
      });
      if (r.usage)
        saveAi(
          recordSpend(loadAi(), r.usage.inputTokens + r.usage.outputTokens, r.usage.requests, ed.store.manifest.id),
        );
      const list = parseCandidates(r.text, cat);
      if (list.length) {
        setFound(list);
        setStatus('Claude chose these from the editor’s settings. Pick one; you can change everything after.');
      } else {
        setFound(local());
        setStatus('Claude’s answer could not be used, so the editor made these on its own.');
      }
    } catch (e) {
      setFound(local());
      setStatus(
        (e as { code?: string }).code === 'cancelled'
          ? 'Stopped. The editor made these on its own.'
          : `Claude could not answer (${e instanceof Error ? e.message : 'unknown'}), so the editor made these on its own.`,
      );
    } finally {
      setBusy(null);
    }
  };

  const use = (k: Candidate) => {
    const L = legacyRuntime();
    const id = newId('character');
    const name = k.name;
    let profile: Record<string, unknown> = { name };
    try {
      profile = L.CharacterCatalog.validate({ ...L.CharacterCatalog.defaults, ...(k.profile ?? {}), name });
    } catch {
      profile = { name };
    }
    const chr: Character = { id, name, role: 'npc', profile, ...(k.body ? { body: k.body } : {}) };
    if (
      ed.exec(
        { type: 'character.create', payload: { character: chr } },
        { label: `New character ${name} (from a picture)` },
      ).ok
    ) {
      ed.studioCharacter.value = id;
      ed.sheetTab.value = k.body ? 'body' : 'look';
      onClose();
    }
  };

  return (
    <div
      class="fp-back"
      role="dialog"
      aria-modal="true"
      aria-label="Character from a picture"
      data-help="characters.fromPicture"
    >
      <div class="fp" ref={box}>
        <header class="fp-head">
          <b>✨ A character from a picture</b>
          <button type="button" class="link" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div class="fp-body">
          <div class="fp-in">
            <label
              class={`fp-drop ${pic ? 'has' : ''}`}
              data-tour="fp-picture"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer?.files?.[0]);
              }}
            >
              {pic ? (
                <img src={pic.url} alt="What you chose" />
              ) : (
                <span>Drop a photo or drawing here, or click to choose one</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="Choose a picture"
                onChange={(e) => void choose((e.target as HTMLInputElement).files?.[0])}
              />
            </label>
            {pic && (
              <div class="fp-swatches" role="group" aria-label="Main colours of the picture">
                {pic.colors.map((col) => (
                  <span class="fp-sw" style={{ background: col }} title={col} />
                ))}
                <button type="button" class="link" onClick={() => setPic(null)}>
                  Remove picture
                </button>
              </div>
            )}
            <label class="field">
              Or describe it
              <textarea
                class="inp"
                rows={3}
                aria-label="Describe it"
                data-tour="fp-words"
                placeholder="a blue fox wizard with a long red scarf"
                value={text}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            <p class="muted small fp-privacy">
              🔒 The picture stays on this device: it goes to Claude only when you press Create
              {aiReady ? '' : ' (the AI builder is not set up, so it is not sent at all)'}, and it is never saved in the
              game. Only use photos of yourself or of people who agreed. A famous character becomes an original
              character in brick style, not a copy.
            </p>
            <div class="row" style={{ gap: '6px' }}>
              <button
                type="button"
                class="btn on"
                data-tour="fp-create"
                disabled={!!busy || reading || (!pic && !text.trim())}
                onClick={() => void create()}
              >
                {busy ? 'Looking…' : reading ? 'Reading the picture…' : 'Create'}
              </button>
              {busy && (
                <button type="button" class="btn" onClick={() => busy.abort()}>
                  Stop
                </button>
              )}
            </div>
            <p class="muted small" role="status">
              {status}
            </p>
          </div>
          <div class="fp-out" role="list" aria-label="Matches">
            {!found && <p class="muted small">Three matches show here, closest first.</p>}
            {found?.map((k, i) => (
              <MatchCard c={c} k={k} i={i} onUse={() => use(k)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ c, k, i, onUse }: { c: ActionCtx; k: Candidate; i: number; onUse(): void }) {
  let body: ResolvedBody | null = null;
  try {
    body = k.body ? resolveBody(k.body, (p) => c.ed.store.get(p)) : null;
  } catch {
    body = null;
  }
  const L = legacyRuntime();
  let profile: Record<string, unknown> = {};
  try {
    profile = L.CharacterCatalog.validate({ ...L.CharacterCatalog.defaults, ...(k.profile ?? {}), name: k.name });
  } catch {
    profile = { ...L.CharacterCatalog.defaults };
  }
  return (
    <div class="fp-card" role="listitem" aria-label={`Match ${i + 1}: ${k.name}`} data-tour={`fp-match-${i}`}>
      <CharacterThumb profile={profile} body={body} size={84} />
      <div class="fp-info">
        <b>
          {i === 0 ? 'Closest · ' : ''}
          {k.name}
        </b>
        <ul class="fp-matched">
          {k.matched.map(([part, what]) => (
            <li>
              <span class="fp-part">{part}</span> ← {what}
            </li>
          ))}
        </ul>
        <button type="button" class="btn" data-tour={`fp-use-${i}`} onClick={onUse}>
          Use this one
        </button>
      </div>
    </div>
  );
}
