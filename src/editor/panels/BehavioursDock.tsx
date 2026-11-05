/**
 * Milestone 3b (B2): the dock's Behaviours tab — every behaviour, with its fields and where it is used. Drag one
 * onto a placed object in the 3D view to attach it to that copy; Attach puts it on the selected object; Open shows
 * its cards and code; + New makes one.
 */
import type { ActionCtx } from '../actions/registry';
import { FieldHelp } from '../components/fields';
import { endDrag, startDrag } from '../interact/drag';
import { BEHAVIOUR_HELP, usedOn } from '../workspaces/logic/BehaviourPanel';
import { graphs, newBehaviour } from '../workspaces/logic/model';

export function BehavioursDock({ c }: { c: ActionCtx }) {
  const { ed } = c;
  ed.revision.value;
  const list = graphs(ed).filter((g) => g.behaviour);
  const sel = ed.selectedInstance.value;
  const open = (id: string) => {
    ed.logicGraph.value = id;
    c.ui.workspace('Logic');
  };
  const make = () => {
    const g = newBehaviour(`Behaviour ${list.length + 1}`);
    if (ed.exec({ type: 'logic.create', payload: { graph: g } }, { label: 'New behaviour' }).ok) open(g.id);
  };
  return (
    <div class="scroll dock-behaviours" data-tour="dock-behaviours" data-help="dock.behaviours">
      <div class="sech" style={{ padding: '8px 10px 4px' }}>
        <span>
          Behaviours
          <FieldHelp label="Behaviours" text={BEHAVIOUR_HELP.what} />
        </span>
        <button type="button" class="link" aria-label="New behaviour" onClick={make}>
          + New
        </button>
      </div>
      {!list.length && (
        <div class="hint" style={{ padding: '0 10px' }}>
          No behaviours yet. + New makes one (or Help › Courses… › Behaviours course).
        </div>
      )}
      <div class="bhv-cards" role="list" aria-label="Behaviours to attach">
        {list.map((g) => {
          const u = usedOn(ed, g.id);
          const n = u.assets.length + u.characters.length + u.copies;
          return (
            <div
              class="bhv-card"
              role="listitem"
              aria-label={g.name}
              draggable
              title="Drag onto a placed object to attach it to that copy"
              onDragStart={(e) => startDrag(e as DragEvent, { kind: 'behaviour', use: g.id, name: g.name })}
              onDragEnd={endDrag}
            >
              <strong>{g.name}</strong>
              <span class="small muted">{g.behaviour!.fields.map((f) => f.label).join(', ') || 'no fields'}</span>
              <span class="small muted">{n ? `on ${n} thing${n === 1 ? '' : 's'}` : 'not attached'}</span>
              <span class="row" style={{ gap: '6px' }}>
                <button
                  type="button"
                  class="btn"
                  disabled={!sel}
                  aria-label={`Attach ${g.name} to the selected object`}
                  title={sel ? `Attach to this ${sel.def.name}` : 'Select a placed object first'}
                  onClick={() =>
                    sel &&
                    ed.exec(
                      {
                        type: 'script.attach',
                        payload: { target: { kind: 'instance', map: ed.mapId.value, id: sel.inst.id }, use: g.id },
                      },
                      { label: `Attach ${g.name}` },
                    )
                  }
                >
                  Attach
                </button>
                <button type="button" class="btn" aria-label={`Open ${g.name}`} onClick={() => open(g.id)}>
                  Open
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
