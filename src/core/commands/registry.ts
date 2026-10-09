import type { CommandBus } from './bus';
import { moveBricks, paintBricks, placeBricks, removeBricks } from './handlers/bricks';
import { deleteFile, putFile } from './handlers/file';
import { setEnvironment } from './handlers/map';

/** Every command type the engine knows. Append-only: add new handlers at the end. */
export function registerAll(bus: CommandBus): CommandBus {
  bus.register('bricks.place', placeBricks);
  bus.register('bricks.remove', removeBricks);
  bus.register('bricks.move', moveBricks);
  bus.register('bricks.paint', paintBricks);
  bus.register('map.setEnvironment', setEnvironment);
  bus.register('file.put', putFile);
  bus.register('file.delete', deleteFile);
  return bus;
}
