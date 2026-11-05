import { z } from 'zod';
import { Health } from '../combat/damage';
import { AssetLight } from '../lighting/light';
import {
  BeamDef,
  BombPlantDef,
  BurnDef,
  FlameDef,
  IceDef,
  LiftDef,
  LockDef,
  MirrorDef,
  MoveDef,
  PickupDef,
  PushDef,
  SwitchDef,
  WindDef,
} from '../puzzles/puzzle';
import { ActionList } from './action';
import { BrickType } from './chunk';
import { Color, id, Vec2, Vec3 } from './common';
import { ScriptAttachments } from './logic';
import { BIOMES } from './map';

/** Asset bricks are local: [type, x, y, z, rot, color, flags] relative to the asset origin. */
export const AssetBrick = z.tuple([
  z.number().int().min(0),
  z.number().int(),
  z.number().int().min(0),
  z.number().int(),
  z.number().int().min(0).max(3),
  z.number().int().min(0),
  z.number().int().min(0).max(15),
]);

export const Socket = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['interact', 'sound', 'npc', 'sign', 'spawn']),
  pos: Vec3,
  prompt: z.string().max(40).optional(),
});

/** assets/<assetId>.json */
export const Asset = z.strictObject({
  id: id('asset'),
  name: z.string().min(1).max(60),
  category: z.enum(['building', 'prop', 'nature', 'vehicle', 'decoration', 'structure']),
  bricks: z.array(AssetBrick).min(1),
  palette: z.strictObject({ types: z.array(BrickType), colors: z.array(Color) }),
  pivot: Vec3,
  footprint: Vec2,
  sockets: z.array(Socket),
  states: z.array(z.string()).min(1),
  initialState: z.string(),
  /** bricks (indexes into `bricks`) that are shown only in the listed state; all others always show */
  onlyIn: z.record(z.string(), z.array(z.number().int().min(0))).optional(),
  /**
   * P31 parts: groups of bricks (indexes into `bricks`) turned and sized freely inside the asset, such as a
   * leaning roof or a tilted wheel. Each brick is in at most one part. Parts are drawn turned; for the
   * brick rules (overlap, support) they keep their straight cells, and nothing new is built on them.
   */
  parts: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(40),
        bricks: z.array(z.number().int().min(0)).min(1),
        tilt: z
          .tuple([z.number().min(-180).max(180), z.number().min(-180).max(180), z.number().min(-180).max(180)])
          .optional(),
        scale: z
          .tuple([z.number().min(0.1).max(10), z.number().min(0.1).max(10), z.number().min(0.1).max(10)])
          .optional(),
        /**
         * P32 moving parts: how the part stands in each state, on top of its tilt: turned (degrees about
         * X, Y, Z, around `hinge`) and moved (studs). When the asset changes state the part eases from one
         * pose to the other over `ease` seconds (a lid swings open, a sword rises). States not listed use
         * no turn and no move. Like turned parts, it keeps its straight cells for the brick rules.
         */
        pose: z
          .record(
            z.string(),
            z.strictObject({
              turn: z
                .tuple([z.number().min(-360).max(360), z.number().min(-360).max(360), z.number().min(-360).max(360)])
                .optional(),
              move: z
                .tuple([z.number().min(-50).max(50), z.number().min(-50).max(50), z.number().min(-50).max(50)])
                .optional(),
            }),
          )
          .optional(),
        /** the point the part turns around, in the asset's frame like a socket (studs; height in world units) */
        hinge: Vec3.optional(),
        /** seconds the part takes to reach its new pose (default 0.6) */
        ease: z.number().min(0).max(10).optional(),
      }),
    )
    .optional(),
  /** where the asset came from: the built-in library, the world generator, or made by the user */
  origin: z.enum(['builtin', 'generated', 'user']).optional(),
  interactions: z.array(
    z.strictObject({
      socket: z.string(),
      when: z.strictObject({ state: z.string() }).optional(),
      do: ActionList,
    }),
  ),
  smash: z.strictObject({
    enabled: z.boolean(),
    rebuild: z.boolean(),
    sound: id('sound').nullable(),
    studs: z.number().int().min(0),
    /** P27 part 3d: what becomes of it once broken (none: rebuildable or gone, as rebuild says) */
    after: z.enum(['rebuild', 'gone', 'respawn', 'rubble']).optional(),
    /** seconds before it comes back (after: respawn); 0: when the player comes back to the map */
    respawnAfter: z.number().min(0).max(3600).optional(),
  }),
  /** P9a: hit points, armour, resistances and what happens at zero (no health: one hit smashes it, as before) */
  health: Health.optional(),
  /** P9b.1: the hero can lock on to it (Z) even without health — a target for a puzzle */
  lockOn: z.boolean().optional(),
  /** P26: a checkpoint: touching it sets where the hero comes back (Retry, a fall) and autosaves; it shows its
   * second state once touched (a flag goes up) */
  checkpoint: z.boolean().optional(),
  /** Milestone 2b: a loose object: in play it falls, tumbles, gets pushed about and floats in water */
  loose: z.boolean().optional(),
  /** P27: it gives light (a torch, a lamp): where on it, and in which of its states */
  light: AssetLight.optional(),
  /** step 12a: a block the hero pushes (and pulls) square along the floor */
  push: PushDef.optional(),
  /** step 12a: a switch (stepped on, hit or pressed; stays on, held, timed or toggles) */
  switch: SwitchDef.optional(),
  /** step 12a: opens with a key (small key, boss key or an item) */
  lock: LockDef.optional(),
  /** step 12a: touched, it is gone and the hero has the item */
  pickup: PickupDef.optional(),
  /** step 12b: it catches fire, burns and is gone (vines, a barricade, a web) */
  burn: BurnDef.optional(),
  /** step 12b: it shines a beam of light straight ahead */
  /** step 12b: the hero climbs it like a ladder (vines, a ladder): walking into it, then up and down */
  climbable: z.boolean().optional(),
  /** step 12b: it grows a bomb to pick (its first state: grown, its second: picked) */
  bombPlant: BombPlantDef.optional(),
  /** step 12b: a fire effect on it, in a state or always */
  flame: FlameDef.optional(),
  beam: BeamDef.optional(),
  /** step 12b: it turns a beam a quarter turn (two states, one leaning each way) */
  mirror: MirrorDef.optional(),
  /** step 12c: ice: a slippery floor, a block that slides on when pushed, melted by fire (or light) */
  ice: IceDef.optional(),
  /** step 12c: a moving platform: back and forth (or up and down), carrying what stands on it */
  moves: MoveDef.optional(),
  /** step 12c: with Climbing: anything (Project settings), the hero cannot climb it (smooth stone) */
  noClimb: z.boolean().optional(),
  /** step 12c-2: it blows wind straight ahead (a fan), in a state or always */
  wind: WindDef.optional(),
  /** step 12c-2: the hero lifts it and carries, puts down or throws it (a rock, a pot) */
  lift: LiftDef.optional(),
  /** step 13b: the hook line and the grapple rope catch on it (a hook target, a ring, a beam); wood catches anyway */
  hook: z.boolean().optional(),
  /** step 13b: it is metal: the magnet glove lifts it (a loose one), and it is heavy (sinks in water) */
  metal: z.boolean().optional(),
  /** step 13c: unseen until looked at through the Lens of Truth (still solid: an invisible platform, a hidden chest) */
  hidden: z.boolean().optional(),
  /** Milestone 3b (B1): behaviour scripts every copy of this asset runs, with their field values */
  scripts: ScriptAttachments.optional(),
  /** step 13c: looks solid but is not (a fake wall or floor: walked or fallen through); the Lens shows it see-through */
  fake: z.boolean().optional(),
  generator: z
    .strictObject({ environments: z.array(z.enum(BIOMES)), weight: z.number().min(0).max(1), placeOn: z.string() })
    .nullable(),
});
export type Asset = z.infer<typeof Asset>;
export type AssetBrick = z.infer<typeof AssetBrick>;
export type Socket = z.infer<typeof Socket>;
