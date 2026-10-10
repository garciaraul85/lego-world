import type { CommandBus } from './bus';
import { moveBricks, paintBricks, placeBricks, removeBricks, updateBricks } from './handlers/bricks';
import { deleteFile, putFile } from './handlers/file';
import {
  addSpawn,
  createMap,
  generateTerrain,
  removeSpawn,
  renameMap,
  setEnvironment,
  updateProject,
  updateSpawn,
} from './handlers/map';

/** Every command type the engine knows. Append-only: add new handlers at the end. */
export function registerAll(bus: CommandBus): CommandBus {
  bus.register('bricks.place', placeBricks);
  bus.register('bricks.remove', removeBricks);
  bus.register('bricks.move', moveBricks);
  bus.register('bricks.paint', paintBricks);
  bus.register('map.setEnvironment', setEnvironment);
  bus.register('file.put', putFile);
  bus.register('file.delete', deleteFile);
  bus.register('map.generate', generateTerrain);
  bus.register('map.create', createMap);
  bus.register('map.rename', renameMap);
  bus.register('map.addSpawn', addSpawn);
  bus.register('map.updateSpawn', updateSpawn);
  bus.register('map.removeSpawn', removeSpawn);
  bus.register('project.update', updateProject);
  bus.register('bricks.update', updateBricks);
  return bus;
}
