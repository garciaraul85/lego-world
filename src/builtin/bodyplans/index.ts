import { type BodyPlan, BodyPlan as BodyPlanSchema } from '../../core/character/body';
import { hash64 } from '../../core/hash';
import { STARTER_PLANS } from './starter';

/**
 * Step 11, 4a: the engine's own body plans — the skeletons and bricks of the starter pack's creatures (the spider
 * boss, the bats, the fire lizard…). Like built-in characters they open in the Character studio, a character can
 * wear one as it is, and Make my own copy puts one in the project to change.
 */
export const builtinPlanId = (slug: string) =>
  `bpl_${(BigInt(`0x${hash64(`builtin:plan:${slug}`)}`) % 36n ** 10n).toString(36).padStart(10, '0')}`;

export const BUILTIN_BODY_PLANS: BodyPlan[] = Object.entries(STARTER_PLANS).map(([slug, raw]) =>
  BodyPlanSchema.parse({ ...raw, id: builtinPlanId(slug) }),
);
const byId = new Map(BUILTIN_BODY_PLANS.map((p) => [p.id, p]));
export const builtinBodyPlan = (id: string): BodyPlan | undefined => byId.get(id);
