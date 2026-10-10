import { describe, expect, it } from 'vitest';
import { ref } from '../../src/builtin/audio';
import { CommandBus, registerAll } from '../../src/core/commands';
import { builtinMediaRef, sha256, sha256Sync } from '../../src/core/media/hash';
import { importMedia, MAX_FILE_BYTES } from '../../src/core/media/import';
import { packProject, unpackMedia, unpackProject } from '../../src/core/project/archive';
import { Autosave } from '../../src/core/project/autosave';
import { MemoryBackend } from '../../src/core/project/backend';
import { MediaStore } from '../../src/core/project/media';
import { newProjectFiles } from '../../src/core/project/new-project';
import { ProjectStore } from '../../src/core/project/store';
import type { MediaIndex } from '../../src/core/schema';

const enc = (s: string) => new TextEncoder().encode(s);
const decode = async () => ({ duration: 1.25, numberOfChannels: 2, sampleRate: 48000 });

describe('SHA-256', () => {
  it('matches the FIPS test vectors (sync and WebCrypto)', async () => {
    expect(sha256Sync(enc('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Sync(enc(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const long = enc('a'.repeat(1000));
    expect(await sha256(long)).toBe(sha256Sync(long));
    expect(builtinMediaRef('smash')).toBe(ref('smash'));
  });
});

describe('Media import (P5.2)', () => {
  it('fingerprints, probes, warns about .ogg and refuses unknown types and big files', async () => {
    const r = await importMedia('creak.ogg', enc('fake audio'), { index: undefined, decode });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.entry).toMatchObject({ kind: 'audio', mime: 'audio/ogg', duration: 1.25, channels: 2 });
    expect(r.warnings[0]).toMatch(/iPhone/);
    expect((await importMedia('a.exe', enc('x'), { index: undefined })).ok).toBe(false);
    expect((await importMedia('a.wav', new Uint8Array(MAX_FILE_BYTES + 1), { index: undefined })).ok).toBe(false);
    const bad = await importMedia('a.wav', enc('x'), {
      index: undefined,
      decode: () => Promise.reject(new Error('no')),
    });
    expect(bad).toEqual({ ok: false, error: 'a.wav could not be decoded as audio.' });
  });

  it('importing the same file twice stores one blob', async () => {
    const backend = new MemoryBackend();
    const store = new ProjectStore(newProjectFiles({ name: 'M', random: () => 0.4 }));
    const bus = registerAll(new CommandBus(store));
    const media = new MediaStore(backend, store.manifest.id);
    const auto = new Autosave(store, backend, { media, setTimer: () => 0, clearTimer: () => {} });
    const bytes = enc('RIFF....WAVE');
    for (let i = 0; i < 2; i++) {
      const r = await importMedia('door.wav', bytes, { index: store.get<MediaIndex>('media/index.json'), decode });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.duplicate).toBe(i === 1);
      media.put(r.ref, new Blob([bytes]));
      if (!r.duplicate)
        bus.execute({ type: 'media.register', payload: { ref: r.ref, entry: r.entry } }, { source: 'user' });
    }
    await auto.flush();
    const p = backend.projects.get(store.manifest.id)!;
    expect(p.media.size).toBe(1);
    expect(Object.keys(store.get<MediaIndex>('media/index.json')!.items)).toHaveLength(1);
    // .bwproj carries the blob
    const ref0 = Object.keys(store.get<MediaIndex>('media/index.json')!.items)[0]!;
    const zip = packProject(store, new Map([[ref0, bytes]]));
    expect(unpackMedia(zip).get(ref0)).toEqual(bytes);
    expect(unpackProject(zip).has('media/index.json')).toBe(true);
    // a file still used cannot be removed
    bus.execute(
      {
        type: 'audio.setEvent',
        payload: {
          id: 'snd_door000001',
          event: {
            clips: [ref0],
            pick: 'random',
            volume: 0,
            pitch: [1, 1],
            bus: 'sfx',
            spatial: true,
            maxVoices: 2,
            cooldown: 0,
          },
        },
      },
      { source: 'user' },
    );
    expect(bus.execute({ type: 'media.remove', payload: { ref: ref0 } }, { source: 'user' }).error).toMatch(
      /still plays/,
    );
  });
});
