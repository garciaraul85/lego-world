import { useState } from 'preact/hooks';
import { type GameOptions, type QuestKind, THEMES, type Theme } from '../../core/gamegen/recipes';

const THEME_LABEL: Record<Theme, string> = {
  town: '🏘 Town',
  volcano: '🌋 Volcano',
  forest: '🌲 Forest',
  mixed: '🧩 Mixed',
};
const QUEST_LABEL: Record<QuestKind, string> = {
  collect: 'Treasure hunt',
  repair: 'Repair crew',
  summit: 'Climb to the top',
};

/** One-click game (board 0a): pick a theme and a size, then Generate & play or watch it being built. */
export function GenerateCard({
  busy,
  onGo,
}: {
  busy: string | null;
  onGo: (options: GameOptions, seed: number, then: 'play' | 'build') => void;
}) {
  const [o, setO] = useState<GameOptions>({ theme: 'town', maps: 2, length: 'short', difficulty: 2 });
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 99_999));
  const set = (p: Partial<GameOptions>) => setO({ ...o, ...p });
  return (
    <section class="hub-card hub-generate" aria-label="Make a game">
      <h2>Make a game in one click</h2>
      <p class="muted">
        Maps, gates, a hero, a quest with logic, HUD and menus, a reward cinematic, music and sounds — all generated,
        all editable.
      </p>
      <div class="hub-row" role="radiogroup" aria-label="Theme">
        {(Object.keys(THEMES) as Theme[]).map((t) => (
          <button
            type="button"
            role="radio"
            aria-checked={o.theme === t}
            class={`btn ${o.theme === t ? 'on' : ''}`}
            onClick={() => set({ theme: t })}
          >
            {THEME_LABEL[t]}
          </button>
        ))}
      </div>
      <div class="hub-grid">
        <label>
          Maps <strong class="mono">{o.maps}</strong>
          <input
            type="range"
            min={1}
            max={5}
            value={o.maps}
            aria-label="Maps"
            onInput={(e) => set({ maps: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
        <label>
          Length
          <select
            class="inp"
            aria-label="Length"
            value={o.length}
            onChange={(e) => set({ length: (e.target as HTMLSelectElement).value as 'short' })}
          >
            <option value="short">Short (24-stud maps)</option>
            <option value="medium">Medium (32-stud maps)</option>
          </select>
        </label>
        <label>
          Difficulty
          <select
            class="inp"
            aria-label="Difficulty"
            value={o.difficulty}
            onChange={(e) => set({ difficulty: Number((e.target as HTMLSelectElement).value) as 1 })}
          >
            <option value={1}>Relaxed · 5 hearts</option>
            <option value={2}>Normal · 3 hearts</option>
            <option value={3}>Hard · 2 hearts</option>
          </select>
        </label>
        <label>
          Quest
          <select
            class="inp"
            aria-label="Quest"
            value={o.quest ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value as QuestKind | '';
              const next = { ...o };
              if (v) next.quest = v;
              else delete next.quest;
              setO(next);
            }}
          >
            <option value="">Surprise me</option>
            {THEMES[o.theme].quests.map((q) => (
              <option value={q}>{QUEST_LABEL[q]}</option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <span class="row" style={{ flexWrap: 'nowrap' }}>
            <input
              class="inp mono"
              aria-label="Seed"
              inputMode="numeric"
              value={seed}
              onChange={(e) => setSeed(Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
            />
            <button
              type="button"
              class="btn icon"
              aria-label="New seed"
              title="New seed"
              onClick={() => setSeed(1 + Math.floor(Math.random() * 99_999))}
            >
              🎲
            </button>
          </span>
        </label>
      </div>
      <div class="hub-row">
        <button type="button" class="btn go hub-big" disabled={!!busy} onClick={() => onGo(o, seed, 'play')}>
          ▶ Generate &amp; play
        </button>
        <button
          type="button"
          class="btn hub-big"
          disabled={!!busy}
          onClick={() => onGo(o, seed, 'build')}
          title="Build the same game one stage at a time, with explanations"
        >
          🔍 Watch it being built, step by step
        </button>
      </div>
      {busy && (
        <div class="hub-busy" role="status">
          {busy}
        </div>
      )}
    </section>
  );
}
