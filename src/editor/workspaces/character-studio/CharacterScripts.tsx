/**
 * Milestone 3b (B1): behaviours a character runs (every copy of it placed on a map), with their field values —
 * the character's side of + Script.
 */
import { useState } from 'preact/hooks';
import { startValues } from '../../../core/logic/behaviours';
import { enemyOfCharacter } from '../../../core/logic/boss';
import { CHARACTER_BUILTINS, lineageOf } from '../../../core/logic/builtins';
import type { Character } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { FieldHelp } from '../../components/fields';
import { BuiltinRow } from '../../panels/BuiltinRow';
import { BEHAVIOUR_HELP, ValueInput } from '../logic/BehaviourPanel';
import { graphs } from '../logic/model';

export function CharacterScripts({ c, chr }: { c: ActionCtx; chr: Character }) {
  const { ed } = c;
  ed.revision.value;
  const [pick, setPick] = useState('');
  const all = graphs(ed).filter((g) => g.behaviour);
  const target = { kind: 'character' as const, id: chr.id };
  const list = chr.scripts ?? [];
  // Milestone 3b (14a-2): a boss behaviour attached makes it a boss (its template's row shows its brain)
  const eff: Character = {
    ...chr,
    enemy: enemyOfCharacter(chr, (id) => all.find((g) => g.id === id)) ?? chr.enemy,
  } as Character;
  return (
    <div class="sec" data-tour="char-behaviours" data-help="characters.behaviours">
      <div class="sech">
        <span>
          Behaviours
          <FieldHelp label="Behaviours" text={BEHAVIOUR_HELP.what} />
        </span>
        <span>{list.length}</span>
      </div>
      {/* Milestone 3b (B4): what the character is (Hero, Neighbour) and its built-ins (Damageable) */}
      {CHARACTER_BUILTINS.filter((b) => b.on(eff))
        // Milestone 3b (B5a): one row per line (PopUp shows EnemyBrain's and Brain's fields; they get no row)
        .filter((b, _i, on) => !on.some((o) => o !== b && lineageOf(o.name).some((x) => x.name === b.name)))
        .map((b) => (
          <BuiltinRow
            key={`${chr.id}:${b.name}`}
            c={c}
            b={b}
            it={eff}
            on={{ character: chr.id }}
            where={chr.name || 'this character'}
          />
        ))}
      {list.map((a) => {
        const g = all.find((x) => x.id === a.use);
        if (!g) return null;
        const values = startValues(g, a.fields);
        return (
          <fieldset class="bhv-attached" aria-label={`Behaviour ${g.name}`}>
            <div class="row" style={{ gap: '6px' }}>
              <button
                type="button"
                class="link"
                onClick={() => {
                  ed.logicGraph.value = g.id;
                  c.ui.workspace('Logic');
                }}
              >
                <strong>{g.name}</strong>
              </button>
              <button
                type="button"
                class="link"
                style={{ marginLeft: 'auto' }}
                aria-label={`Remove ${g.name}`}
                onClick={() => ed.exec({ type: 'script.detach', payload: { target, use: g.id } })}
              >
                ×
              </button>
            </div>
            {g.behaviour!.fields.map((f) => (
              <label class="field">
                <span>
                  {f.label}
                  {f.help && <FieldHelp label={f.label} text={f.help} />}
                </span>
                <ValueInput
                  ed={ed}
                  type={f.type}
                  label={`${g.name} ${f.label}`}
                  value={values[f.name]!}
                  min={f.min}
                  max={f.max}
                  onCommit={(v) =>
                    ed.exec({ type: 'script.setField', payload: { target, use: g.id, name: f.name, value: v } })
                  }
                />
              </label>
            ))}
          </fieldset>
        );
      })}
      <div class="row" style={{ gap: '6px' }}>
        <select
          class="inp"
          style={{ flex: 1 }}
          aria-label="Behaviour to attach"
          value={pick || all[0]?.id}
          onChange={(ev) => setPick((ev.target as HTMLSelectElement).value)}
        >
          {!all.length && <option value="">(no behaviours yet: make one in Logic)</option>}
          {all.map((g) => (
            <option value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          type="button"
          class="btn on"
          disabled={!all.length}
          onClick={() => {
            const use = pick || all[0]?.id;
            if (use) ed.exec({ type: 'script.attach', payload: { target, use } });
          }}
        >
          + Script
        </button>
      </div>
    </div>
  );
}
