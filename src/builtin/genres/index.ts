import { type Genre, Genre as GenreSchema } from '../../core/genres/types';
import explore from './explore.json';
import open from './open.json';

/**
 * P18: the built-in genres, one data file each (no code per genre). Open shows everything; a genre view
 * shows only what that genre uses. More genres arrive with the phases whose systems they need.
 */
export const GENRES: readonly Genre[] = [open, explore].map((g) => GenreSchema.parse(g));

export const DEFAULT_GENRE = 'open';

/** A genre by id (an unknown id falls back to Open, so an old or foreign project still opens). */
export function genreById(id: string | undefined): Genre {
  return GENRES.find((g) => g.id === id) ?? GENRES[0]!;
}
