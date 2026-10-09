import type { LegacyPiece, LegacySave } from '../legacy/types';
import type { Problem } from './problems';

/**
 * Brings any v1-v4 `brick-builder` save to the v4 shape, mirroring v68's parseBuild:
 * - v1/v2 pieces have no ids; v68 assigns id = index + 1 (and ignores any id present).
 * - a missing environment means day, no weather.
 * Everything else in v1-v3 already has the v4 shape (v68 reads all four with one parser).
 */
export function normalizeLegacy(input: unknown, problems: Problem[]): LegacySave {
  const obj = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!obj || typeof obj !== 'object') throw new Error('Not a LEGO World save: expected an object.');
  const save = obj as Partial<LegacySave>;
  if (save.format !== 'brick-builder') throw new Error('Not a LEGO World save: format is not "brick-builder".');
  if (![1, 2, 3, 4].includes(save.version as number))
    throw new Error(`Unsupported LEGO World save version ${save.version}.`);
  if (!Array.isArray(save.pieces)) throw new Error('LEGO World save has no pieces array.');
  const out = structuredClone(save) as LegacySave;
  if (out.version < 3) {
    out.pieces = out.pieces.map((p, i): LegacyPiece => ({ ...p, id: i + 1 }));
    problems.push({
      level: 'info',
      code: 'legacy.ids',
      message: `v${out.version} save: brick ids assigned in file order (as v68 does).`,
    });
  }
  out.environment ??= { time: 'day', rain: false, snow: false, snowing: false };
  out.version = 4;
  return out;
}
