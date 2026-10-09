import { z } from 'zod';
import { type IdKind, idPattern } from '../ids';

export const id = (kind: IdKind) => z.string().regex(idPattern(kind), `expected a ${kind} id`);
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const Vec2 = z.tuple([z.number(), z.number()]);
export const Color = z.string().regex(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i, 'expected #rgb or #rrggbb');
/** `sha256:<64 hex>`: a media blob stored by content hash. */
export const MediaRef = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'expected sha256:<hex>');
export const IsoDate = z.string().datetime();
/** Free-form data copied from a legacy save that has no v5 home yet. Never dropped. */
export const LegacyBlob = z.record(z.string(), z.unknown());
