import { useEffect, useState } from 'preact/hooks';
import { newId } from '../../../core/ids';
import { type Art, paths, type Screen, type Widget } from '../../../core/schema';
import { allScreens, isBuiltinScreen } from '../../../engine/ui/screens';
import type { ActionCtx } from '../../actions/registry';
import { ScreenThumb } from '../../components/previews';
import { matches, NoMatch, SearchBox } from '../../components/SearchBox';
import { ArtEditor } from './art/ArtEditor';
import { ArtLibrary, ArtStart } from './art/ArtLibrary';
import { artFont, artUrl } from './art/render';
import { addChild, KIND_LABEL, moveAt, replaceAt, template, widgetAt } from './model';
import { Palette } from './Palette';
import { ScreenCanvas } from './ScreenCanvas';
import { ScreenProps, WidgetProps } from './WidgetProps';
import { WidgetTree } from './WidgetTree';

/**
 * Screens workspace (board 6, P5.9): screens list and widget tree, the canvas with device frames,
 * and properties. Editing a built-in screen saves a project copy with the same id (Reset brings it back).
 */
export function ScreensWorkspace({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const list = allScreens(ed.store);
  const screen = list.find((s) => s.id === ed.screenId.value) ?? list.find((s) => s.kind === 'hud') ?? list[0]!;
  useEffect(() => {
    if (ed.screenId.value !== screen.id) {
      ed.screenId.value = screen.id;
      ed.widgetPath.value = '';
    }
  }, [screen.id]);
  const [tab, setTab] = useState<'screens' | 'art'>('screens');
  const [artId, setArtId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const openArt = artId ? ed.store.get<Art>(paths.art(artId as Art['id'])) : undefined;
  const path = ed.widgetPath.value ?? '';
  const widget = widgetAt(screen.root, path) ?? screen.root;
  const save = (next: Screen, label?: string) =>
    ed.exec({ type: 'screen.put', payload: { screen: next } }, label ? { label } : {});
  const setRoot = (root: Widget, label?: string) => save({ ...screen, root }, label);
  const own = ed.store.has(paths.screen(screen.id));
  const builtin = isBuiltinScreen(screen.id);
  const add = (type: Widget['type'], at?: { anchor: [number, number]; offset: [number, number] }) => {
    let n = 1;
    const ids = new Set<string>();
    const walk = (w: Widget) => {
      if (w.id) ids.add(w.id);
      for (const k of w.children ?? []) walk(k);
    };
    walk(screen.root);
    while (ids.has(`${type}${n}`)) n++;
    const t = template(type, n);
    // dropped on the canvas: on the screen where it was let go; on the root, new widgets are anchored in the
    // middle; inside a panel they flow
    const r = at
      ? addChild(screen.root, '', { ...t, anchor: at.anchor, offset: at.offset })
      : addChild(screen.root, path, path === '' && !t.anchor ? { ...t, anchor: [0.5, 0.5] } : t);
    if (setRoot(r.root, `Add ${type}`).ok) ed.widgetPath.value = r.path;
  };
  const create = () => {
    const id = newId('screen');
    const s: Screen = {
      id: id as Screen['id'],
      kind: 'custom',
      name: `Screen ${list.length + 1}`,
      music: null,
      pausesGame: true,
      root: {
        type: 'panel',
        style: { bg: '#05070dc0' },
        children: [
          {
            type: 'panel',
            id: 'box',
            anchor: [0.5, 0.5],
            style: { layout: 'column', gap: 12, w: 360, bg: '#141a2be8', pad: 24, radius: 16 },
            children: [
              {
                type: 'text',
                id: 'title',
                text: 'New screen',
                style: { fontSize: 32, weight: 'bold', color: '#ffffff', align: 'center' },
              },
              { type: 'button', id: 'close', label: 'Close', onPress: [{ do: 'hideScreen', screen: id as never }] },
            ],
          },
        ],
      },
    };
    if (save(s, 'New screen').ok) {
      ed.screenId.value = s.id;
      ed.widgetPath.value = '';
    }
  };
  return (
    <div class={`studio screens-ws${tab === 'art' ? ' art-mode' : ''}`}>
      <section class="panel studio-lib" aria-label="Screens and widgets">
        <div class="ptabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'screens'}
            class={`tab ${tab === 'screens' ? 'on' : ''}`}
            data-tip="Screens and their widgets"
            onClick={() => {
              setTab('screens');
              setArtId(null);
            }}
          >
            Screens
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'art'}
            class={`tab ${tab === 'art' ? 'on' : ''}`}
            data-tip="Backgrounds, icons and fonts for your screens"
            onClick={() => setTab('art')}
          >
            Art
          </button>
        </div>
        {tab === 'art' ? (
          <div class="scroll">
            <ArtLibrary ed={ed} open={openArt ? artId : null} onOpen={setArtId} />
          </div>
        ) : (
          <div class="scroll">
            <div class="sech" style={{ padding: '8px 10px 4px' }}>
              <span>Screens · {list.length}</span>
              <button type="button" class="link" onClick={create}>
                + New
              </button>
            </div>
            <div style={{ padding: '0 8px 6px' }}>
              <SearchBox label="screens" value={q} onInput={setQ} tour="screens-search" />
            </div>
            <NoMatch q={list.some((s) => matches(q, s.name, KIND_LABEL[s.kind])) ? '' : q} what="screens" />
            {list
              .filter((s) => matches(q, s.name, KIND_LABEL[s.kind]))
              .map((s) => (
                <button
                  type="button"
                  class={`lib-item ${s.id === screen.id ? 'on' : ''}`}
                  onClick={() => {
                    ed.screenId.value = s.id;
                    ed.widgetPath.value = '';
                  }}
                >
                  <ScreenThumb ed={ed} screen={s} width={48} />
                  <span class="asset-name">
                    {ed.store.manifest.entry.screen === s.id ? '★ ' : ''}
                    {s.name}
                  </span>
                  <span class="mono small muted">
                    {KIND_LABEL[s.kind]}
                    {isBuiltinScreen(s.id) ? (ed.store.has(paths.screen(s.id)) ? ' · edited' : ' · built-in') : ''}
                  </span>
                </button>
              ))}
            <div class="sech" style={{ padding: '10px 10px 4px' }}>
              <span>Widgets</span>
            </div>
            <WidgetTree root={screen.root} selected={path} onSelect={(p) => (ed.widgetPath.value = p)} />
            <div class="sech" style={{ padding: '10px 10px 4px' }}>
              <span>Add · click or drag onto the screen</span>
            </div>
            <Palette onAdd={(t) => add(t)} />
          </div>
        )}
      </section>
      {tab === 'art' ? (
        <section class="panel studio-main" aria-label="Art editor">
          {openArt ? (
            <ArtEditor key={openArt.id} ed={ed} art={openArt} onClose={() => setArtId(null)} />
          ) : (
            <ArtStart ed={ed} onOpen={setArtId} />
          )}
        </section>
      ) : (
        <section class="panel studio-main" aria-label="Screen canvas">
          <div class="ptabs studio-head">
            <strong class="studio-title">{screen.name}</strong>
            <span class="muted small">
              {KIND_LABEL[screen.kind]}
              {screen.pausesGame ? ' · pauses the game' : ''}
              {builtin
                ? own
                  ? ' · built-in, edited in this project'
                  : ' · built-in (editing saves a project copy)'
                : ''}
            </span>
          </div>
          <ScreenCanvas
            key={screen.id}
            ed={ed}
            screen={screen}
            onPlay={() => c.ui.play('engine', { fromEntry: true })}
            onChange={(p, w, label) => setRoot(replaceAt(screen.root, p, w), label)}
            onDrop={(type, anchor, offset) => add(type, { anchor, offset })}
            artUrl={(id) => artUrl(ed, id)}
            artFont={(ref) => artFont(ed, ref)}
          />
        </section>
      )}
      {tab === 'screens' && (
        <section class="panel studio-lib" aria-label="Widget properties">
          <div class="ptabs">
            <span class="tab on">Properties</span>
          </div>
          <div class="scroll">
            <WidgetProps
              key={`${screen.id}:${path}`}
              c={c}
              screen={screen}
              path={path}
              widget={widget}
              onChange={(w, label) => setRoot(replaceAt(screen.root, path, w), label ?? `Edit ${w.id ?? w.type}`)}
            />
            {path !== '' && (
              <div class="sec">
                <div class="row">
                  <button
                    type="button"
                    class="btn"
                    aria-label="Move earlier"
                    onClick={() => {
                      const r = moveAt(screen.root, path, -1);
                      if (setRoot(r.root, 'Move widget').ok) ed.widgetPath.value = r.path;
                    }}
                  >
                    ↑ Earlier
                  </button>
                  <button
                    type="button"
                    class="btn"
                    aria-label="Move later"
                    onClick={() => {
                      const r = moveAt(screen.root, path, 1);
                      if (setRoot(r.root, 'Move widget').ok) ed.widgetPath.value = r.path;
                    }}
                  >
                    ↓ Later
                  </button>
                  <button
                    type="button"
                    class="btn danger"
                    onClick={() => {
                      if (setRoot(replaceAt(screen.root, path, null), 'Delete widget').ok) ed.widgetPath.value = '';
                    }}
                  >
                    Delete widget
                  </button>
                </div>
              </div>
            )}
            {path === '' && <ScreenProps c={c} screen={screen} onChange={save} />}
            <div class="sec" style={{ borderBottom: 0 }}>
              {builtin ? (
                <button
                  type="button"
                  class="btn wide"
                  disabled={!own}
                  onClick={() => ed.exec({ type: 'screen.delete', payload: { id: screen.id, builtin: true } })}
                >
                  Reset to built-in
                </button>
              ) : (
                <button
                  type="button"
                  class="btn wide danger"
                  onClick={() => {
                    if (ed.exec({ type: 'screen.delete', payload: { id: screen.id } }).ok) ed.screenId.value = null;
                  }}
                >
                  Delete screen
                </button>
              )}
              <p class="hint">
                Logic: Show screen / Hide screen / Set screen text and On screen button use these screens.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
