import { useState } from 'preact/hooks';
import type { FileDiff } from '../../core/ai/patch';
import { describeDiff, fileDiffLines, groupOf } from './diff';

/** Every file the patch changes, grouped, each with a line diff of its JSON (P8.3). */
export function DiffView({ diff }: { diff: FileDiff[] }) {
  const groups = new Map<string, FileDiff[]>();
  for (const d of diff) groups.set(groupOf(d.path), [...(groups.get(groupOf(d.path)) ?? []), d]);
  return (
    <div class="aip-diff">
      {[...groups].map(([g, files]) => (
        <div key={g}>
          <div class="aip-diff-group">
            {g} <span class="muted">· {files.length}</span>
          </div>
          {files.map((d) => (
            <FileRow key={d.path} d={d} />
          ))}
        </div>
      ))}
    </div>
  );
}

function FileRow({ d }: { d: FileDiff }) {
  const [open, setOpen] = useState(false);
  const lines = open ? fileDiffLines(d) : null;
  return (
    <details class="aip-file" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <span class={`aip-kind ${d.kind}`}>{d.kind === 'added' ? '+' : d.kind === 'removed' ? '−' : '~'}</span>
        <span class="mono">{d.path}</span>
        <span class="muted small"> {describeDiff(d)}</span>
      </summary>
      {open &&
        (lines ? (
          <pre class="aip-lines">
            {lines.slice(0, 400).map((l, i) => (
              <span key={i} class={`l${l.kind === '+' ? 'a' : l.kind === '-' ? 'r' : l.kind === '…' ? 'f' : ''}`}>
                {l.kind === '…' ? `  ⋯ ${l.text}` : `${l.kind} ${l.text}`}
                {'\n'}
              </span>
            ))}
            {lines.length > 400 ? `… ${lines.length - 400} more lines` : ''}
          </pre>
        ) : (
          <p class="muted small">Brick data (shown live in the Scene when you walk through the steps).</p>
        ))}
    </details>
  );
}
