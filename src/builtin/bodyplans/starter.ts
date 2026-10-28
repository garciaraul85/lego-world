import type { BodyPlan } from '../../core/character/body';

/** Step 11, 4a: the starter pack's creature bodies, by slug (filled in with the cast) */
export const STARTER_PLANS: Record<string, Omit<BodyPlan, 'id'>> = {};
