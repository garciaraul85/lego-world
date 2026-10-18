import { GENRES } from '../../builtin/genres';
import type { Genre } from '../../core/genres/types';

/**
 * P18: “What are you making?” — a card per genre (start hub, New project). Open is every control; a genre
 * shows the tools that kind of game uses and starts from its template.
 */
export function GenreChoice({ value, onPick }: { value: string; onPick: (genre: string) => void }) {
  return (
    <div class="genre-cards" role="radiogroup" aria-label="What are you making?" data-tour="genre-cards">
      {GENRES.map((g) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === g.id}
          class={`genre-card ${value === g.id ? 'on' : ''}`}
          data-genre={g.id}
          onClick={() => onPick(g.id)}
        >
          <span class="genre-icon" aria-hidden="true">
            {g.icon}
          </span>
          <strong>{g.name}</strong>
          <span class="small muted">{g.blurb}</span>
        </button>
      ))}
    </div>
  );
}

/** The start hub's card: pick a genre to begin a game of that kind (its template, or a blank project). */
export function GenreStart({ busy, onStart }: { busy: boolean; onStart: (g: Genre) => void }) {
  return (
    <section class="hub-card" aria-label="What are you making?">
      <h3>What are you making?</h3>
      <p class="muted small">
        Pick a kind of game: the editor shows the tools it uses (switch any time in the top bar; Open shows everything).
      </p>
      <div class="genre-cards">
        {GENRES.map((g) => (
          <button type="button" class="genre-card" data-genre={g.id} disabled={busy} onClick={() => onStart(g)}>
            <span class="genre-icon" aria-hidden="true">
              {g.icon}
            </span>
            <strong>{g.name}</strong>
            <span class="small muted">{g.blurb}</span>
            <span class="small">{g.template.recipe ? `Starts from: ${g.template.name}` : 'Starts blank'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
