import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { serializeFile } from '../json/stable';
import { fileKindOf } from '../schema';
import type { ProjectStore } from './store';

/** `.bwproj`: a zip of every project file except `.editor/`, with the same paths as the layout. */
export function packProject(store: ProjectStore): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const path of [...store.keys()].sort()) {
    if (path.startsWith('.editor/')) continue;
    files[path] = strToU8(serializeFile(path, store.get(path)));
  }
  return zipSync(files, { level: 6 });
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
