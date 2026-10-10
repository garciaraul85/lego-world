import { useEffect, useState } from 'preact/hooks';
import type { ProjectMeta } from '../../core/project/backend';

export function RecentProjects({
  list,
  current,
  onOpen,
  onClose,
}: {
  list: () => Promise<ProjectMeta[]>;
  current: { id: string; name: string };
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ProjectMeta[] | null>(null);
  useEffect(() => {
    void list().then((l) => setItems([...l].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 8)));
  }, []);
  return (
    <section class="hub-card" aria-label="Recent projects">
      <h3>Recent projects</h3>
      <button type="button" class="mi" onClick={onClose}>
        <span>
          Continue <strong>{current.name}</strong>
        </span>
        <span class="k">open now</span>
      </button>
      {!items && <span class="muted small">Loading…</span>}
      {items
        ?.filter((p) => p.id !== current.id)
        .map((p) => (
          <button type="button" class="mi" onClick={() => onOpen(p.id)}>
            <span>{p.name}</span>
            <span class="k">{p.modified.slice(0, 16).replace('T', ' ')}</span>
          </button>
        ))}
    </section>
  );
}
