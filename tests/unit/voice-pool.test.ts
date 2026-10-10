import { describe, expect, it } from 'vitest';
import { Ducker } from '../../src/engine/audio/Ducker';
import { dbToGain, gainToDb } from '../../src/engine/audio/Mixer';
import { VoicePool } from '../../src/engine/audio/VoicePool';

type V = { event: string; priority: number; started: number };

function request(pool: VoicePool<V>, event: string, max: number, priority: number, t: number) {
  const a = pool.admit(event, max, priority);
  if (!a.ok) return false;
  if (a.steal) pool.remove(a.steal);
  pool.add({ event, priority, started: t });
  return true;
}

describe('VoicePool (P5.1)', () => {
  it('100 simultaneous requests play at most 32 voices', () => {
    const pool = new VoicePool<V>(32);
    for (let i = 0; i < 100; i++) request(pool, `e${i % 10}`, 32, 2, i);
    expect(pool.active.length).toBe(32);
    expect(pool.stolen).toBe(68);
  });

  it('an event at its maxVoices steals its own oldest voice', () => {
    const pool = new VoicePool<V>(32);
    for (let i = 0; i < 5; i++) request(pool, 'step', 3, 2, i);
    const steps = pool.active.filter((v) => v.event === 'step');
    expect(steps.map((v) => v.started)).toEqual([2, 3, 4]);
  });

  it('a full pool steals the oldest lowest-priority voice and refuses when everything outranks the request', () => {
    const pool = new VoicePool<V>(4);
    request(pool, 'amb', 4, 1, 0);
    request(pool, 'ui', 4, 3, 1);
    request(pool, 'ui2', 4, 3, 2);
    request(pool, 'ui3', 4, 3, 3);
    expect(request(pool, 'sfx', 4, 2, 4)).toBe(true);
    expect(pool.active.some((v) => v.event === 'amb')).toBe(false);
    expect(request(pool, 'amb2', 4, 1, 5)).toBe(false);
    expect(pool.refused).toBe(1);
  });
});

describe('Mixer math and ducking', () => {
  it('converts dB to gain and back; -60 dB is silence', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(-60)).toBe(0);
    expect(gainToDb(dbToGain(-12))).toBeCloseTo(-12, 6);
  });

  it('ducks the target while any trigger of the rule is active and releases after the last ends', () => {
    const d = new Ducker([{ when: 'voice', target: 'music', amount: -8, attack: 0.06, release: 0.6 }]);
    expect(d.begin('voice')).toEqual([{ target: 'music', db: -8, timeConstant: 0.02 }]);
    expect(d.begin('voice')).toEqual([]); // overlapping line keeps the duck
    expect(d.duckDb('music')).toBe(-8);
    expect(d.end('voice')).toEqual([]);
    expect(d.end('voice')).toEqual([{ target: 'music', db: 0, timeConstant: expect.closeTo(0.2, 9) }]);
    expect(d.duckDb('music')).toBe(0);
  });
});
