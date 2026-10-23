import { initPhysics } from '../src/engine/physics/physics';

// Milestone 2b: the physics core loads before any play session starts, as the editor loads it at start
await initPhysics();
