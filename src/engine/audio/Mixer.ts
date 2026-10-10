import type { Mixer as MixerData } from '../../core/schema';

export const BUSES = ['master', 'music', 'sfx', 'voice', 'ui', 'ambience'] as const;
export type Bus = (typeof BUSES)[number];

/** dB → linear gain; -60 dB and below is silence. */
export const dbToGain = (db: number) => (db <= -60 ? 0 : 10 ** (db / 20));
export const gainToDb = (g: number) => (g <= 0.001 ? -60 : 20 * Math.log10(g));

type BusNodes = { input: GainNode; fader: GainNode; duck: GainNode; meter: AnalyserNode };

/**
 * One audio graph (P5.1): every bus is input → fader → duck → meter → master, master → destination.
 * Faders follow audio/mixer.json live (editing a fader during Play changes the volume at once).
 */
export class Mixer {
  readonly buses = new Map<Bus, BusNodes>();
  private scratch = new Float32Array(1024);

  constructor(readonly ctx: AudioContext) {
    for (const name of BUSES) {
      const input = ctx.createGain();
      const fader = ctx.createGain();
      const duck = ctx.createGain();
      const meter = ctx.createAnalyser();
      meter.fftSize = 1024;
      input.connect(fader).connect(duck).connect(meter);
      this.buses.set(name, { input, fader, duck, meter });
    }
    const master = this.buses.get('master')!;
    master.meter.connect(ctx.destination);
    for (const name of BUSES) if (name !== 'master') this.buses.get(name)!.meter.connect(master.input);
  }

  input(bus: string): GainNode {
    return (this.buses.get(bus as Bus) ?? this.buses.get('sfx')!).input;
  }

  apply(data: MixerData) {
    const t = this.ctx.currentTime;
    for (const name of BUSES) this.buses.get(name)!.fader.gain.setTargetAtTime(dbToGain(data.buses[name]), t, 0.02);
  }

  duck(bus: string, db: number, timeConstant: number) {
    const b = this.buses.get(bus as Bus);
    b?.duck.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, timeConstant);
  }

  /** RMS level of a bus in dB (for the meters). */
  level(bus: Bus): number {
    const m = this.buses.get(bus)!.meter;
    m.getFloatTimeDomainData(this.scratch as Float32Array<ArrayBuffer>);
    let s = 0;
    for (const v of this.scratch) s += v * v;
    return gainToDb(Math.sqrt(s / this.scratch.length));
  }
}
