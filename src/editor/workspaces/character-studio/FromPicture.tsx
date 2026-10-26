import { useEffect, useRef, useState } from 'preact/hooks';
import { composeAsset } from '../../../core/assets/compose';
import { creaturePlan } from '../../../core/character/compose';
import { type ResolvedBody, resolveBody } from '../../../core/character/resolve';
import { describeMap, type MapSpec, mapSpecFromWords } from '../../../core/gamegen/map-spec';
import { assetSpot } from '../../../core/gamegen/places';
import { newId } from '../../../core/ids';
import { type Asset, type Character, type MapDoc, paths } from '../../../core/schema';
import { legacyRuntime } from '../../../engine/legacy/runtime-modules';
import { sessionKey } from '../../../platform/ai/keys';
import { type AiSettings, gameSpent, loadAi, recordSpend, saveAi } from '../../../platform/ai/settings';
import type { ActionCtx } from '../../actions/registry';
import { pickProvider } from '../../ai/providers';
import { paintWithMarks } from '../../character/draw-marks';
import { AssetThumb } from '../../components/AssetThumb';
import { type AssetCandidate, assetPrompt, localAssetCandidates, parseAssetCandidates } from '../../maker/asset-match';
import { mapCommands, mapPrompt, mapVariants, parseMapCandidates } from '../../maker/map-maker';
import { type LookPicture, lookColors, lookPrints } from './bring-look';
import { FromPicturePreview, type PreviewWhat } from './FromPicturePreview';
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

async function readPicture(file: File): Promise<{
  url: string;
  colors: string[];
  blob: Blob;
  base64: string;
  mediaType: string;
  look: LookPicture;
}> {
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
  const pixels = g.getImageData(0, 0, w, h).data;
  const colors = mainColors(pixels, w, h, 4);
  const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  const dataUrl = cv.toDataURL('image/jpeg', 0.85);
  return {
    url,
    colors,
    blob,
    base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
    mediaType: 'image/jpeg',
    look: { image: cv, width: w, height: h, pixels },
  };
}

type Picture = Awaited<ReturnType<typeof readPicture>>;

export function FromPicture({ c, onClose }: { c: ActionCtx; onClose(): void }) {
  const ed = c.ed;
  const [pic, setPic] = useState<Picture | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<AbortController | null>(null);
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  // Milestone 3, 10d part 4: what to make — a character, or an asset (a house, a castle, a ship, a tree…)
  const kind = ed.makeKind.value;
  const [things, setThings] = useState<AssetCandidate[] | null>(null);
  // Milestone 3, 10d part 5: maps — the land, its buildings and its people
  const [maps, setMaps] = useState<{ spec: MapSpec; seed: number; matched: [string, string][] }[] | null>(null);
  const [building, setBuilding] = useState<number | null>(null);
  // a big preview of one match (turn, zoom, try it) before it is used; maps are built once for it and reused
  const [preview, setPreview] = useState<(PreviewWhat & { use(): void; place?: () => void; useLabel: string }) | null>(
    null,
  );
  const builtMaps = useRef(new Map<number, Awaited<ReturnType<typeof mapCommands>>>());
  useEffect(() => {
    setFound(null);
    setThings(null);
    setMaps(null);
    setStatus('');
    setPreview(null);
  }, [kind]);
  useEffect(() => {
    builtMaps.current.clear();
    setPreview(null);
  }, [maps, things, found]);
  const [aiReady, setAiReady] = useState(false);
  const [reading, setReading] = useState(false);
  // Milestone 3, 10d: v68's Bring your look for a person in the picture
  const [partColors, setPartColors] = useState(true);
  const [prints, setPrints] = useState(false);
  /** what v68's tools add to a person's look from the picture: colours by part, and prints if asked */
  const lookFor = (k: Candidate): Record<string, unknown> => {
    if (!pic || k.body || k.creature) return {};
    const out: Record<string, unknown> = {};
    try {
      if (partColors) Object.assign(out, lookColors(pic.look));
      if (prints) out.paint = lookPrints(pic.look);
    } catch {
      /* the picture could not be read by part: words and colours only */
    }
    return out;
  };
  // Milestone 3, 10d: each match's drawings (its marks over the prints from the picture), drawn as matches come
  const [drawn, setDrawn] = useState<Map<Candidate, Record<string, string>>>(new Map());
  useEffect(() => {
    let gone = false;
    void (async () => {
      const out = new Map<Candidate, Record<string, string>>();
      for (const k of found ?? []) {
        if (!k.marks?.length || k.body || k.creature) continue;
        const under = (lookFor(k).paint as Record<string, string> | undefined) ?? {};
        out.set(k, { ...under, ...(await paintWithMarks(under, k.marks)) });
      }
      if (!gone) setDrawn(out);
    })();
    return () => {
      gone = true;
    };
  }, [found, prints, partColors, pic]);
  /** the look a match gets: v68's tools from the picture, then its drawings */
  const lookOf = (k: Candidate): Record<string, unknown> => {
    const look = lookFor(k);
    const paint = drawn.get(k);
    return paint ? { ...look, paint } : look;
  };
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

  /** asks Claude (or, without it, the words) for one kind of answer; null when Claude was not asked or failed */
  const askClaude = async (prompt: string, what: string): Promise<{ text: string | null; note: string }> => {
    const s = withKey(loadAi());
    const capped =
      (s.dailyCap > 0 && s.spent.tokens >= s.dailyCap) ||
      (s.gameCap > 0 && gameSpent(s, ed.store.manifest.id) >= s.gameCap);
    const provider = capped ? null : await pickProvider(() => s);
    if (!provider)
      return {
        text: null,
        note: capped
          ? 'Made by the editor on its own (today’s AI spending cap is reached).'
          : `Made by the editor on its own: the words pick what it is, the picture gives the colours. Set up the AI builder for Claude to look at the picture too.`,
      };
    const ctl = new AbortController();
    setBusy(ctl);
    setStatus('Claude is looking…');
    try {
      const r = await provider.run({
        instructions: `You choose settings for ${what} in a brick game editor. Answer with JSON only.`,
        turns: [{ role: 'user', content: prompt }],
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
      return { text: r.text, note: '' };
    } catch (e) {
      return {
        text: null,
        note:
          (e as { code?: string }).code === 'cancelled'
            ? 'Stopped. The editor made these on its own.'
            : `Claude could not answer (${e instanceof Error ? e.message : 'unknown'}), so the editor made these on its own.`,
      };
    } finally {
      setBusy(null);
    }
  };

  const createThing = async () => {
    const colors = pic?.colors ?? [];
    const local = () => localAssetCandidates(text, colors);
    const r = await askClaude(assetPrompt(text, !!pic, colors), 'an object (a building, vehicle, prop or plant)');
    const list = r.text ? parseAssetCandidates(r.text) : [];
    if (list.length) {
      setThings(list);
      setStatus('Claude chose these; the editor built them from bricks. Pick one; you can change every brick after.');
    } else {
      setThings(local());
      setStatus(r.text ? 'Claude’s answer could not be used, so the editor made these on its own.' : r.note);
    }
  };

  const createMap = async () => {
    const colors = pic?.colors ?? [];
    const r = await askClaude(mapPrompt(text, !!pic, colors), 'a game map (its land, buildings and people)');
    const list = r.text ? parseMapCandidates(r.text) : [];
    const seed = () => Math.floor(Math.random() * 99_999_999);
    if (list.length) {
      setMaps(list.map((m) => ({ ...m, seed: seed() })));
      setStatus('Claude chose these; the editor builds the land, buildings and people when you make one.');
      return;
    }
    const spec = mapSpecFromWords(text.trim() ? text : landFromColours(colors));
    setMaps(
      mapVariants(spec).map((v) => ({
        spec: v.spec,
        seed: v.seed,
        matched: [...describeMap(v.spec), ['Version', v.note] as [string, string]],
      })),
    );
    setStatus(r.text ? 'Claude’s answer could not be used, so the editor made these on its own.' : r.note);
  };

  /** builds the map (on a copy first), then makes it in the project as one step and opens it */
  const makeMap = async (i: number) => {
    const m = maps?.[i];
    if (!m) return;
    setBuilding(i);
    setStatus('Building the land, the buildings and the people…');
    try {
      // the map previewed is the map made (built again if the game changed since)
      let out = builtMaps.current.get(i) ?? (await mapCommands(ed, m.spec, m.seed));
      if (ed.bus.check(out.commands)) out = await mapCommands(ed, m.spec, m.seed);
      const r = ed.exec(out.commands, { label: `New map ${m.spec.name} (from a picture)` });
      if (r.ok) {
        ed.openMap(out.map);
        c.ui.workspace('Scene');
        if (out.notes.length) ed.notify(out.notes.join(' '));
        onClose();
      } else setStatus(`The map could not be made: ${r.error ?? 'unknown'}`);
    } catch (e) {
      setStatus(`The map could not be made: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBuilding(null);
    }
  };

  const previewMap = async (i: number) => {
    const m = maps?.[i];
    if (!m) return;
    setBuilding(i);
    setStatus('Building the map for a look…');
    try {
      const out = builtMaps.current.get(i) ?? (await mapCommands(ed, m.spec, m.seed));
      builtMaps.current.set(i, out);
      setStatus('');
      setPreview({
        kind: 'map',
        name: m.spec.name,
        store: out.store,
        map: out.map,
        notes: out.notes,
        use: () => void makeMap(i),
        useLabel: 'Make this map',
      });
    } catch (e) {
      setStatus(`The map could not be built: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBuilding(null);
    }
  };

  const create = async () => {
    if (kind === 'asset') return createThing();
    if (kind === 'map') return createMap();
    const cat = catalog();
    const colors = pic?.colors ?? [];
    const local = () => localCandidates(text, colors, cat, { personFromPhoto: !!pic && partColors });
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

  /** Milestone 3, 10d part 4: the asset built into the project, and if asked, placed on a flat free spot near the start */
  const useThing = (k: AssetCandidate, placeIt = false) => {
    const id = newId('asset');
    const def = composeAsset(k.spec, id);
    const create = { type: 'asset.create', payload: { asset: def } };
    const place = placeIt ? assetSpot(ed.store, ed.bus, ed.mapId.value, def, { before: [create], minSteps: 4 }) : null;
    if (placeIt && !place) {
      setStatus('There is no flat free spot near the start for it: use it, then place it from the Assets dock.');
      return;
    }
    if (ed.exec([create, ...(place ? [place] : [])], { label: `New asset ${def.name} (from a picture)` }).ok) {
      ed.studioAsset.value = id;
      if (!placeIt) c.ui.workspace('Assets');
      onClose();
    }
  };

  /** the command that stands a new character on the open map, a few studs in front of its first spawn point */
  const placeCommand = (character: string) => {
    const map = ed.mapId.value;
    const sp = ed.store.get<MapDoc>(paths.map(map))?.spawns[0];
    const yaw = sp?.yaw ?? 0;
    const at = sp?.pos ?? [0, 0.4, 0];
    const pos: [number, number, number] = [at[0] - Math.sin(yaw) * 5, at[1], at[2] - Math.cos(yaw) * 5];
    return { type: 'npc.place', payload: { map, character, pos, heading: yaw } };
  };
  const use = (k: Candidate, placeIt = false) => {
    const L = legacyRuntime();
    const id = newId('character');
    const name = k.name;
    let profile: Record<string, unknown> = { name };
    try {
      const look = lookOf(k);
      profile = L.CharacterCatalog.validate({
        ...L.CharacterCatalog.defaults,
        ...look,
        ...(k.profile ?? {}),
        ...(look.paint ? { paint: look.paint } : {}),
        name,
      });
    } catch {
      profile = { name };
    }
    // Milestone 3, 10d: a figure of its own becomes a body plan of the project's, and the character wears it
    const planId = k.creature ? newId('bodyplan') : null;
    const body =
      k.creature && planId
        ? { plan: planId as NonNullable<Character['body']>['plan'], colors: k.creature.colors }
        : k.body;
    const chr: Character = { id, name, role: 'npc', profile, ...(body ? { body } : {}) };
    const cmds = [
      ...(k.creature && planId
        ? [{ type: 'bodyplan.put', payload: { plan: creaturePlan({ ...k.creature, name }, planId) } }]
        : []),
      { type: 'character.create', payload: { character: chr } },
      // and, if asked, it stands on the open map as a neighbour, in front of the first spawn point
      ...(placeIt ? [placeCommand(id)] : []),
    ];
    if (ed.exec(cmds, { label: `New character ${name} (from a picture)` }).ok) {
      ed.studioCharacter.value = id;
      ed.sheetTab.value = body ? 'body' : 'look';
      onClose();
    }
  };

  return (
    <div
      class="fp-back"
      role="dialog"
      aria-modal="true"
      aria-label={
        kind === 'asset' ? 'Asset from a picture' : kind === 'map' ? 'Map from a picture' : 'Character from a picture'
      }
      data-help={
        kind === 'asset' ? 'assets.fromPicture' : kind === 'map' ? 'world.fromPicture' : 'characters.fromPicture'
      }
    >
      <div class="fp" ref={box}>
        {preview && (
          <FromPicturePreview
            what={preview}
            onClose={() => {
              setPreview(null);
              // the preview's view had the keys: the dialog gets them back (Escape closes it again)
              setTimeout(() => box.current?.querySelector<HTMLElement>('[data-tour="fp-create"]')?.focus(), 0);
            }}
            onUse={() => {
              const go = preview.use;
              setPreview(null);
              go();
            }}
            {...(preview.place
              ? {
                  onPlace: () => {
                    const go = preview.place!;
                    setPreview(null);
                    go();
                  },
                }
              : {})}
            useLabel={preview.useLabel}
          />
        )}
        <header class="fp-head">
          <b>✨ Make from a picture</b>
          <span class="row" role="radiogroup" aria-label="What to make" data-tour="fp-kind" style={{ gap: '4px' }}>
            {(
              [
                ['character', '🧑 Character'],
                ['asset', '🏠 Asset or building'],
                ['map', '🗺 Map'],
              ] as const
            ).map(([k, label]) => (
              <button
                type="button"
                role="radio"
                aria-checked={kind === k}
                class={`btn small ${kind === k ? 'on' : ''}`}
                data-tour={`fp-kind-${k}`}
                onClick={() => (ed.makeKind.value = k)}
              >
                {label}
              </button>
            ))}
          </span>
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
            {pic && kind === 'character' && (
              <div class="col small" style={{ gap: '4px' }} data-tour="fp-look">
                <label class="row" style={{ gap: '6px' }}>
                  <input
                    type="checkbox"
                    aria-label="Colour each part from the picture"
                    checked={partColors}
                    onChange={(e) => setPartColors((e.target as HTMLInputElement).checked)}
                  />
                  A person: colour each part (skin, hair, shirt, trousers, shoes) from where it is in the picture
                </label>
                <label class="row" style={{ gap: '6px' }}>
                  <input
                    type="checkbox"
                    aria-label="Print the face and clothes from the picture"
                    data-tour="fp-prints"
                    checked={prints}
                    onChange={(e) => setPrints((e.target as HTMLInputElement).checked)}
                  />
                  Print the face and clothes from the picture on the figure (the prints are saved in the game)
                </label>
              </div>
            )}
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
                placeholder={
                  kind === 'map'
                    ? 'a snowy mountain village at night with a lighthouse, three red houses, a blacksmith and two guards · a pirate island at sunset with a ship and palm trees'
                    : kind === 'asset'
                      ? 'a red brick house with a blue door and a chimney · a pirate ship with black sails · a stone castle · a lighthouse'
                      : 'a blue fox wizard with a long red scarf · a curvy pirate with a red star on her cheek · a walking teapot'
                }
                value={text}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            <p class="muted small fp-privacy">
              🔒 The picture stays on this device: it goes to Claude only when you press Create
              {aiReady ? '' : ' (the AI builder is not set up, so it is not sent at all)'}, and it is never saved in the
              game unless you tick Print. Only use photos of yourself or of people who agreed. A famous character
              becomes an original character in brick style, not a copy.
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
            {!(kind === 'asset' ? things : kind === 'map' ? maps : found) && (
              <p class="muted small">Three matches show here, closest first.</p>
            )}
            {kind === 'map' &&
              maps?.map((m, i) => (
                <div
                  class="fp-card"
                  role="listitem"
                  aria-label={`Match ${i + 1}: ${m.spec.name}`}
                  data-tour={`fp-match-${i}`}
                >
                  <div class="fp-map-icon" aria-hidden="true">
                    🗺
                  </div>
                  <div class="fp-info">
                    <b>
                      {i === 0 ? 'Closest · ' : ''}
                      {m.spec.name}
                    </b>
                    <ul class="fp-matched">
                      {m.matched.map(([part, what]) => (
                        <li>
                          <span class="fp-part">{part}</span> ← {what}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      class="btn"
                      data-tour={`fp-use-${i}`}
                      disabled={building !== null}
                      onClick={() => void makeMap(i)}
                    >
                      {building === i ? 'Building…' : 'Make this map'}
                    </button>
                    <button
                      type="button"
                      class="btn"
                      data-tour={`fp-preview-${i}`}
                      disabled={building !== null}
                      onClick={() => void previewMap(i)}
                    >
                      🔍 Preview
                    </button>
                  </div>
                </div>
              ))}
            {kind === 'asset' &&
              things?.map((k, i) => (
                <ThingCard
                  k={k}
                  i={i}
                  onUse={() => useThing(k)}
                  onPlace={() => useThing(k, true)}
                  onPreview={(def) =>
                    setPreview({
                      kind: 'asset',
                      name: k.name,
                      def,
                      use: () => useThing(k),
                      place: () => useThing(k, true),
                      useLabel: 'Use this one',
                    })
                  }
                />
              ))}
            {kind === 'character' &&
              found?.map((k, i) => (
                <MatchCard
                  c={c}
                  k={k}
                  i={i}
                  look={lookOf(k)}
                  onUse={() => use(k)}
                  onPlace={() => use(k, true)}
                  onPreview={(profile, body) =>
                    setPreview({
                      kind: 'character',
                      name: k.name,
                      profile,
                      body,
                      use: () => use(k),
                      place: () => use(k, true),
                      useLabel: 'Use this one',
                    })
                  }
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  c,
  k,
  i,
  look,
  onUse,
  onPlace,
  onPreview,
}: {
  c: ActionCtx;
  k: Candidate;
  i: number;
  look: Record<string, unknown>;
  onUse(): void;
  onPlace(): void;
  onPreview(profile: Record<string, unknown>, body: ResolvedBody | null): void;
}) {
  let body: ResolvedBody | null = null;
  try {
    if (k.creature) {
      // a figure of its own is drawn from a body plan made for the preview (saved only when used)
      const plan = creaturePlan(k.creature, 'bpl_preview000');
      body = resolveBody({ plan: plan.id, colors: k.creature.colors }, (p) =>
        p === `bodyplans/${plan.id}.json` ? plan : c.ed.store.get(p),
      );
    } else body = k.body ? resolveBody(k.body, (p) => c.ed.store.get(p)) : null;
  } catch {
    body = null;
  }
  const L = legacyRuntime();
  let profile: Record<string, unknown> = {};
  try {
    profile = L.CharacterCatalog.validate({
      ...L.CharacterCatalog.defaults,
      ...look,
      ...(k.profile ?? {}),
      ...(look.paint ? { paint: look.paint } : {}),
      name: k.name,
    });
  } catch {
    profile = { ...L.CharacterCatalog.defaults };
  }
  return (
    <div class="fp-card" role="listitem" aria-label={`Match ${i + 1}: ${k.name}`} data-tour={`fp-match-${i}`}>
      <button
        type="button"
        class="fp-thumb-btn"
        title="See it big: turn, zoom and try it"
        aria-label={`Preview ${k.name}`}
        onClick={() => onPreview(profile, body)}
      >
        <CharacterThumb profile={profile} body={body} size={84} />
      </button>
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
        <button type="button" class="btn" data-tour={`fp-place-${i}`} onClick={onPlace}>
          Use and place on the map
        </button>
        <button type="button" class="btn" data-tour={`fp-preview-${i}`} onClick={() => onPreview(profile, body)}>
          🔍 Preview
        </button>
      </div>
    </div>
  );
}

/** Milestone 3, 10d part 4: an asset match — a picture of the bricks it is built from, and what it matched */
function ThingCard({
  k,
  i,
  onUse,
  onPlace,
  onPreview,
}: {
  k: AssetCandidate;
  i: number;
  onUse(): void;
  onPlace(): void;
  onPreview(def: Asset): void;
}) {
  const def = composeAsset(k.spec, 'ast_preview000');
  return (
    <div class="fp-card" role="listitem" aria-label={`Match ${i + 1}: ${k.name}`} data-tour={`fp-match-${i}`}>
      <button
        type="button"
        class="fp-thumb-btn"
        title="See it big: turn and zoom"
        aria-label={`Preview ${k.name}`}
        onClick={() => onPreview(def)}
      >
        <AssetThumb def={def} size={84} />
      </button>
      <div class="fp-info">
        <b>
          {i === 0 ? 'Closest · ' : ''}
          {k.name}
        </b>
        <span class="muted small">{def.bricks.length} bricks</span>
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
        <button type="button" class="btn" data-tour={`fp-place-${i}`} onClick={onPlace}>
          Use and place on the map
        </button>
        <button type="button" class="btn" data-tour={`fp-preview-${i}`} onClick={() => onPreview(def)}>
          🔍 Preview
        </button>
      </div>
    </div>
  );
}

/** Milestone 3, 10d part 5: with a picture and no words, its main colours say the land (blue sea, white snow…) */
export function landFromColours(colors: string[]): string {
  const words: string[] = [];
  for (const c of colors.slice(0, 3)) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
    if (r > 200 && g > 200 && b > 200) words.push('snowy mountains');
    else if (b > r + 30 && b > g) words.push('beach');
    else if (g > r + 20 && g > b) words.push('forest');
    else if (r > 150 && g > 120 && b < 120) words.push('desert');
    else if (r > 150 && g < 90 && b < 70) words.push('volcano');
    else if (Math.abs(r - g) < 20 && Math.abs(g - b) < 20) words.push('city');
  }
  return words.length ? `a place with ${[...new Set(words)].join(' and ')}` : 'a prairie';
}
