import { CommandBus, registerAll } from '../../../src/core/commands';
import { allCommands, generateGame } from '../../../src/core/gamegen/generateGame';
import { ProjectStore } from '../../../src/core/project/store';

const NOW = '2026-01-01T00:00:00.000Z';
/** A 4-map generated game for AI context tests. */
export function bigGame() {
  const g = generateGame({ theme: 'mixed', maps: 4, length: 'medium', difficulty: 3 }, 777, { now: NOW });
  const store = new ProjectStore(g.files);
  const bus = registerAll(new CommandBus(store));
  const r = bus.execute(allCommands(g), { source: 'generator' });
  if (!r.ok) throw new Error(r.error);
  return { g, store, bus };
}
