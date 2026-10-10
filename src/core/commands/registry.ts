import type { CommandBus } from './bus';
import {
  createAsset,
  deleteAsset,
  makeAsset,
  moveInstance,
  placeAsset,
  removeInstance,
  setInstanceState,
  unpackInstance,
  updateAsset,
} from './handlers/assets';
import { moveBricks, paintBricks, placeBricks, removeBricks, updateBricks } from './handlers/bricks';
import { deleteFile, putFile } from './handlers/file';
import { connectGate, deleteGate, deleteMap, updateGate } from './handlers/gates';
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
  bus.register('gate.connect', connectGate);
  bus.register('gate.update', updateGate);
  bus.register('gate.delete', deleteGate);
  bus.register('map.delete', deleteMap);
  bus.register('asset.place', placeAsset);
  bus.register('instance.move', moveInstance);
  bus.register('instance.remove', removeInstance);
  bus.register('instance.setState', setInstanceState);
  bus.register('instance.unpack', unpackInstance);
  bus.register('asset.make', makeAsset);
  bus.register('asset.create', createAsset);
  bus.register('asset.update', updateAsset);
  bus.register('asset.delete', deleteAsset);
  return bus;
}
