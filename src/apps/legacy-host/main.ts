/**
 * Phase 0 host for LEGO World v68 (dist/engine.html).
 * Keeps v68 exactly as it is and mirrors its saves into a v5 project in IndexedDB:
 *   boot:   IndexedDB project -> toLegacy -> localStorage -> start v68
 *           (first run: v68's localStorage save is migrated and imported once)
 *   edits:  v68 writes localStorage -> 1 s later -> diff -> file commands (source "legacy") -> autosave
 * window.__bw exposes store, bus and autosave for debugging and e2e tests.
 */
import { toLegacy } from '../../core/bridge/legacy-bridge';
import { CommandBus, registerAll } from '../../core/commands';
import { hash64 } from '../../core/hash';
import { serializeFile } from '../../core/json/stable';
import { LEGACY_STORAGE_KEY } from '../../core/legacy/constants';
import { migrate } from '../../core/migrate';
import { Autosave } from '../../core/project/autosave';
import { loadProject, saveAll } from '../../core/project/load';
import { ProjectStore } from '../../core/project/store';
import { legacySyncCommands } from '../../core/sync/legacy-sync';
import { IdbBackend } from '../../platform/idb-backend';

declare global {
  interface Window {
    __bwLegacy?: () => void;
    __bw?: Record<string, unknown>;
  }
}

const CURRENT = 'brickworlds.currentProject';
const SYNCED = 'brickworlds.syncedHash';
const ls = window.localStorage;
const rawSet = ls.setItem.bind(ls);

function log(...a: unknown[]) {
  console.info('[brickworlds]', ...a);
}

async function boot() {
  const backend = new IdbBackend();
  let store: ProjectStore | null = null;
  const legacyText = ls.getItem(LEGACY_STORAGE_KEY);
  const currentId = ls.getItem(CURRENT);
  try {
    if (currentId && (await backend.readFile(currentId, 'project.json'))) {
      const loaded = await loadProject(backend, currentId);
      store = loaded.store;
      for (const p of loaded.problems) console.warn('[brickworlds]', p.file, p.message);
      // localStorage newer than our last sync (tab closed inside the debounce): it wins, synced below.
      if (!legacyText || hash64(legacyText) === ls.getItem(SYNCED)) {
        const text = JSON.stringify(toLegacy(store));
        rawSet(LEGACY_STORAGE_KEY, text);
        rawSet(SYNCED, hash64(text));
      }
    } else if (legacyText) {
      const r = migrate(legacyText, { name: 'My LEGO World' });
      store = new ProjectStore(r.files);
      await saveAll(backend, store, serializeFile);
      rawSet(CURRENT, store.manifest.id);
      rawSet(SYNCED, hash64(legacyText));
      log('Imported your LEGO World build into project', store.manifest.id, r.problems);
    }
  } catch (e) {
    console.error('[brickworlds] storage unavailable; LEGO World runs without the v5 mirror', e);
    store = null;
  }

  let bus: CommandBus | null = null;
  let autosave: Autosave | null = null;
  const attach = (s: ProjectStore) => {
    store = s;
    bus = registerAll(new CommandBus(s));
    autosave = new Autosave(s, backend);
    window.__bw = { ...window.__bw, store, bus, autosave };
  };
  if (store) attach(store);
  const stats = { saves: 0, syncs: 0, commands: 0, rejected: 0 };
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sync = () => {
    timer = null;
    const text = pending;
    pending = null;
    if (!text) return;
    stats.syncs++;
    try {
      if (!store || !bus) {
        // First save of a brand-new world: create the project now.
        // The first write goes through autosave too, so it can never race a later, smaller save.
        const created = new ProjectStore(migrate(text, { name: 'My LEGO World' }).files);
        attach(created);
        created.markDirty(created.keys());
        rawSet(CURRENT, created.manifest.id);
        void autosave?.flush();
      } else {
        const cmds = legacySyncCommands(store, text);
        stats.commands += cmds.length;
        if (cmds.length) {
          const r = bus.execute(cmds, { source: 'legacy', label: 'Edit in LEGO World' });
          if (!r.ok) {
            stats.rejected++;
            console.warn('[brickworlds] sync rejected:', r.error);
          }
        }
      }
      rawSet(SYNCED, hash64(text));
    } catch (e) {
      console.error('[brickworlds] sync failed', e);
    }
  };

  ls.setItem = (key: string, value: string) => {
    rawSet(key, value);
    if (key !== LEGACY_STORAGE_KEY) return;
    stats.saves++;
    pending = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(sync, 1000);
  };

  /** Sync any pending v68 save now and write it to IndexedDB. Resolves when stored. */
  const flushAll = (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      sync();
    }
    return autosave?.flush() ?? Promise.resolve();
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushAll());
  window.addEventListener('pagehide', () => void flushAll());

  window.__bw = { ...window.__bw, backend, stats, flush: flushAll, toLegacy: () => store && toLegacy(store) };
  // Pending localStorage edits from a closed tab: mirror them now.
  if (store && legacyText && hash64(legacyText) !== ls.getItem(SYNCED)) {
    pending = legacyText;
    sync();
  }
  void IdbBackend.persist();
  window.__bwLegacy?.();
}

void boot();
