import { TEMPLATES } from './template-list';

export function Templates({ busy, onPick }: { busy: boolean; onPick: (t: (typeof TEMPLATES)[number]) => void }) {
  return (
    <section class="hub-card" aria-label="Templates">
      <h3>Start from a template</h3>
      <div class="hub-templates">
        {TEMPLATES.map((t) => (
          <button type="button" class="hub-template" disabled={busy} onClick={() => onPick(t)}>
            <strong>{t.title}</strong>
            <span class="muted small">{t.blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
