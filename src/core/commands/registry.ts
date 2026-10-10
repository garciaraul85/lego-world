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
import {
  createCharacter,
  createClip,
  deleteCharacter,
  deleteClip,
  updateCharacter,
  updateClip,
} from './handlers/characters';
import { deleteFile, putFile } from './handlers/file';
import { connectGate, deleteGate, deleteMap, updateGate } from './handlers/gates';
import {
  addNode,
  connect,
  createLogic,
  deleteLogic,
  disconnect,
  moveNodes,
  removeNodes,
  replaceLogic,
  setArgs,
  setVariable,
} from './handlers/logic';
import {
  addSpawn,
  addZone,
  createMap,
  generateTerrain,
  removeSpawn,
  removeZone,
  renameMap,
  setEnvironment,
  updateProject,
  updateSpawn,
  updateZone,
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
  bus.register('character.create', createCharacter);
  bus.register('character.update', updateCharacter);
  bus.register('character.delete', deleteCharacter);
  bus.register('clip.create', createClip);
  bus.register('clip.update', updateClip);
  bus.register('clip.delete', deleteClip);
  bus.register('logic.create', createLogic);
  bus.register('logic.replace', replaceLogic);
  bus.register('logic.delete', deleteLogic);
  bus.register('logic.addNode', addNode);
  bus.register('logic.removeNodes', removeNodes);
  bus.register('logic.moveNodes', moveNodes);
  bus.register('logic.connect', connect);
  bus.register('logic.disconnect', disconnect);
  bus.register('logic.setArgs', setArgs);
  bus.register('logic.setVariable', setVariable);
  bus.register('map.addZone', addZone);
  bus.register('map.updateZone', updateZone);
  bus.register('map.removeZone', removeZone);
  return bus;
}
