import type { CommandBus } from './bus';
import { deleteArt, putArt } from './handlers/art';
import {
  createAsset,
  deleteAsset,
  makeAsset,
  moveInstance,
  placeAsset,
  removeInstance,
  renameInstance,
  setInstanceState,
  transformInstance,
  unpackInstance,
  updateAsset,
} from './handlers/assets';
import {
  deleteScreen,
  putScreen,
  registerMedia,
  removeMedia,
  setMixer,
  setMusicSettings,
  setMusicState,
  setSoundEvent,
} from './handlers/audio';
import { deleteBodyPlan, putBodyPlan } from './handlers/bodyplans';
import { moveBricks, paintBricks, placeBricks, removeBricks, updateBricks } from './handlers/bricks';
import {
  createCharacter,
  createClip,
  deleteCharacter,
  deleteClip,
  updateCharacter,
  updateClip,
} from './handlers/characters';
import { deleteCinematic, putCinematic } from './handlers/cinematics';
import { deleteDialogue, putDialogue } from './handlers/dialogue';
import { deleteEffect, deleteScreenEffect, putEffect, putScreenEffect } from './handlers/effects';
import { deleteFile, putFile } from './handlers/file';
import { connectGate, deleteGate, deleteMap, updateGate } from './handlers/gates';
import { addItem, removeItem, setMapAudio, updateItem } from './handlers/items';
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
import { placeNpc, removeNpc } from './handlers/npcs';
import { putProgress } from './handlers/progress';
import { scatterAsset } from './handlers/scatter';

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
  bus.register('asset.scatter', scatterAsset);
  bus.register('instance.move', moveInstance);
  bus.register('instance.remove', removeInstance);
  bus.register('instance.setState', setInstanceState);
  bus.register('instance.rename', renameInstance);
  bus.register('npc.place', placeNpc);
  bus.register('progress.put', putProgress);
  bus.register('dialogue.put', putDialogue);
  bus.register('dialogue.delete', deleteDialogue);
  bus.register('bodyplan.put', putBodyPlan);
  bus.register('bodyplan.delete', deleteBodyPlan);
  bus.register('effect.put', putEffect);
  bus.register('effect.delete', deleteEffect);
  bus.register('screenEffect.put', putScreenEffect);
  bus.register('screenEffect.delete', deleteScreenEffect);
  bus.register('npc.remove', removeNpc);
  bus.register('instance.unpack', unpackInstance);
  bus.register('instance.transform', transformInstance);
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
  bus.register('audio.setEvent', setSoundEvent);
  bus.register('audio.setMusic', setMusicState);
  bus.register('audio.setMusicSettings', setMusicSettings);
  bus.register('audio.setMixer', setMixer);
  bus.register('media.register', registerMedia);
  bus.register('art.put', putArt);
  bus.register('art.delete', deleteArt);
  bus.register('media.remove', removeMedia);
  bus.register('screen.put', putScreen);
  bus.register('screen.delete', deleteScreen);
  bus.register('item.add', addItem);
  bus.register('item.update', updateItem);
  bus.register('item.remove', removeItem);
  bus.register('map.setAudio', setMapAudio);
  bus.register('cinematic.put', putCinematic);
  bus.register('cinematic.delete', deleteCinematic);
  return bus;
}
