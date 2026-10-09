import { type MapDoc, paths, TIMES } from '../../schema';
import type { CommandHandler } from '../types';

export type SetEnvironment = {
  map: string;
  time?: MapDoc['sky']['time'];
  rain?: boolean;
  snow?: boolean;
  snowing?: boolean;
};

export const setEnvironment: CommandHandler<SetEnvironment> = {
  label: () => 'Change sky and weather',
  validate(store, p) {
    if (!store.has(paths.map(p.map))) return `Map ${p.map} does not exist.`;
    if (p.time !== undefined && !TIMES.includes(p.time)) return `Time must be one of ${TIMES.join(', ')}.`;
    return null;
  },
  apply(store, p) {
    const m = store.get<MapDoc>(paths.map(p.map))!;
    store.put(paths.map(p.map), {
      ...m,
      sky: { time: p.time ?? m.sky.time },
      weather: {
        rain: p.rain ?? m.weather.rain,
        snow: p.snow ?? m.weather.snow,
        snowing: p.snowing ?? m.weather.snowing,
      },
    });
  },
};
