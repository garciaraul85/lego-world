import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { serializeFile } from '../json/stable';
import { fileKindOf } from '../schema';
import type { ProjectStore } from './store';

/**
 * `.bwproj`: a zip of every project file except `.editor/`, with the same paths as the layout,
 * plus imported media blobs as `media/<sha256 hex>` (stored, not recompressed).
 */
export function packProject(store: ProjectStore, media: ReadonlyMap<string, Uint8Array> = new Map()): Uint8Array {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  for (const path of [...store.keys()].sort()) {
    if (path.startsWith('.editor/')) continue;
    files[path] = strToU8(serializeFile(path, store.get(path)));
  }
  for (const [ref, bytes] of media) files[`media/${ref.replace(/^sha256:/, '')}`] = [bytes, { level: 0 }];
  return zipSync(files, { level: 6 });
}

/** media blobs inside a `.bwproj`, by MediaRef */
export function unpackMedia(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(unzipSync(bytes, { filter: (f) => /^media\/[0-9a-f]{64}$/.test(f.name) })))
    out.set(`sha256:${path.slice(6)}`, data);
  return out;
}

/** Reads a `.bwproj`. Unknown paths are ignored; JSON errors throw with the file name. */
export function unpackProject(bytes: Uint8Array): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [path, data] of Object.entries(unzipSync(bytes))) {
    if (path.endsWith('/') || !fileKindOf(path) || path.startsWith('.editor/')) continue;
    try {
      out.set(path, JSON.parse(strFromU8(data)));
    } catch {
      throw new Error(`${path} in the project file is not valid JSON.`);
    }
  }
  if (!out.has('project.json')) throw new Error('This is not a Brick Worlds project (project.json missing).');
  return out;
}
