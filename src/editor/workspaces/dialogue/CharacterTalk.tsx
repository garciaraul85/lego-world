import { checkCondition } from '../../../core/dialogue/condition';
import { blankConversation, type Conversation } from '../../../core/dialogue/schema';
import { newId } from '../../../core/ids';
import type { Character } from '../../../core/schema';
import type { ActionCtx } from '../../actions/registry';
import { DraftText } from '../../components/fields';
import { conversationPreview } from '../../components/previews';
import { speakerName } from '../../panels/AudioFields';
import { DialogueEditor } from './DialogueEditor';
import { conversations } from './model';

/**
 * P22: conversations in the Character studio — the list of the game's conversations (left), the open one
 * (middle, Dialogue view), and a character's Talk list, barks and name colour (right).
 */
export function newConversation(c: ActionCtx, chr: Character | null, inProject: boolean): string | null {
  const { ed } = c;
  const id = newId('dialogue');
  const n = conversations(ed).length + 1;
  const conv = blankConversation(
    id,
    chr && inProject ? `${chr.name} talk${n > 1 ? ` ${n}` : ''}` : `Conversation ${n}`,
    chr && inProject ? chr.id : '',
  );
  const cmds: { type: string; payload: unknown }[] = [{ type: 'dialogue.put', payload: { conversation: conv } }];
  // a new conversation for the open character joins its Talk list
  if (chr && inProject)
    cmds.push({
      type: 'character.update',
      payload: { character: { ...chr, talk: [...(chr.talk ?? []), { conversation: id }].slice(0, 12) } },
    });
  if (!ed.exec(cmds as never, { label: 'New conversation' }).ok) return null;
  ed.dialogueId.value = id;
  ed.charTab.value = 'dialogue';
  return id;
}

export function ConversationList({ c, chr, inProject }: { c: ActionCtx; chr: Character; inProject: boolean }) {
  const { ed } = c;
  const list = conversations(ed);
  return (
    <>
      <div class="sech" style={{ padding: '10px 10px 4px' }}>
        <span>Conversations</span>
        <button type="button" class="link" data-tour="dialogue-new" onClick={() => newConversation(c, chr, inProject)}>
          + New
        </button>
      </div>
      {list.map((d) => (
        <button
          type="button"
          role="option"
          aria-selected={ed.charTab.value === 'dialogue' && ed.dialogueId.value === d.id}
          class={`lib-item ${ed.charTab.value === 'dialogue' && ed.dialogueId.value === d.id ? 'on' : ''}`}
          onClick={() => {
            ed.dialogueId.value = d.id;
            ed.charTab.value = 'dialogue';
          }}
        >
          <span aria-hidden="true">💬</span>
          <span class="lib-text">
            <span class="asset-name">{d.name}</span>
            <span class="pv-lines small muted" aria-hidden="true">
              {conversationPreview(d, (who) => speakerName(ed, who), 60)}
            </span>
          </span>
          <span class="mono small muted">{d.sections.reduce((n, s) => n + s.steps.length, 0)}</span>
        </button>
      ))}
      {!list.length && (
        <div class="hint" style={{ padding: '4px 10px' }}>
          No conversations yet. + New writes one for this character.
        </div>
      )}
    </>
  );
}

/** The middle of the Character studio in the Dialogue view. */
export function DialogueMain({ c, chr, inProject }: { c: ActionCtx; chr: Character; inProject: boolean }) {
  const { ed } = c;
  const list = conversations(ed);
  const conv = list.find((d) => d.id === ed.dialogueId.value) ?? null;
  if (!conv)
    return (
      <div class="dlg-empty">
        <p>
          Conversations are what characters say: lines, choices the player picks, and actions (give an item, set a
          variable, play a cinematic). A character's Talk list says which one plays.
        </p>
        <button type="button" class="btn on" onClick={() => newConversation(c, chr, inProject)}>
          + New conversation{inProject ? ` for ${chr.name}` : ''}
        </button>
        {list.length > 0 && <p class="muted small">Or pick one from Conversations on the left.</p>}
      </div>
    );
  return <DialogueEditor c={c} conv={conv} />;
}

/** A character's Talk list (which conversation plays, first whose condition holds), barks and name colour. */
export function TalkSection({ c, chr, inProject }: { c: ActionCtx; chr: Character; inProject: boolean }) {
  const { ed } = c;
  const list = conversations(ed);
  const talk = chr.talk ?? [];
  const barks = chr.barks ?? [];
  const save = (next: Character, label: string) => {
    if (!inProject) {
      ed.notify('Add the character to the game first (change anything in its look).');
      return;
    }
    ed.exec({ type: 'character.update', payload: { character: next } }, { label });
  };
  const name = (id: string) => list.find((d) => d.id === id)?.name ?? id;
  return (
    <div class="sec" data-tour="char-talk" data-help="characters.talk">
      <div class="sech">
        <span>Talk</span>
      </div>
      <p class="muted small">
        When the hero talks to {chr.name} (T), the first conversation whose condition holds plays (an empty condition
        always does).
      </p>
      {talk.map((t, i) => {
        const bad = checkCondition(t.if);
        return (
          <div class="talk-row">
            <span class="mono small muted">{i + 1}</span>
            <button
              type="button"
              class="link"
              title={`Open it. ${conversationPreview(
                list.find((d) => d.id === t.conversation),
                (who) => speakerName(ed, who),
              )}`}
              onClick={() => {
                ed.dialogueId.value = t.conversation;
                ed.charTab.value = 'dialogue';
              }}
            >
              💬 {name(t.conversation)}
            </button>
            <DraftText
              class={`inp mono ${bad ? 'bad' : ''}`}
              aria-label={`Condition for ${name(t.conversation)}`}
              placeholder="always"
              title={bad ?? 'Plays when this holds (empty: always)'}
              value={t.if ?? ''}
              onCommit={(v) => {
                const cond = v.trim();
                const next = talk.map((x, j) => {
                  if (j !== i) return x;
                  const { if: _o, ...rest } = x;
                  return cond ? { ...rest, if: cond } : rest;
                });
                save({ ...chr, talk: next }, 'Talk condition');
              }}
            />
            <button
              type="button"
              class="btn icon"
              aria-label="Earlier"
              disabled={i === 0}
              onClick={() => {
                const next = [...talk];
                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                save({ ...chr, talk: next }, 'Reorder talk');
              }}
            >
              ↑
            </button>
            <button
              type="button"
              class="btn icon"
              aria-label="Remove from Talk"
              onClick={() => save({ ...chr, talk: talk.filter((_, j) => j !== i) }, 'Remove from talk')}
            >
              ×
            </button>
            {bad && <span class="err small">{bad}</span>}
          </div>
        );
      })}
      <div class="row">
        <select
          class="inp"
          aria-label="Add a conversation to Talk"
          value=""
          onChange={(e) => {
            const id = (e.target as HTMLSelectElement).value;
            if (id === '+') newConversation(c, chr, inProject);
            else if (id) save({ ...chr, talk: [...talk, { conversation: id }].slice(0, 12) }, 'Add to talk');
          }}
        >
          <option value="">+ Add a conversation…</option>
          {list
            .filter((d: Conversation) => !talk.some((t) => t.conversation === d.id))
            .map((d) => (
              <option value={d.id}>{d.name}</option>
            ))}
          <option value="+">New conversation…</option>
        </select>
      </div>
      <div class="sech" style={{ marginTop: '8px' }}>
        <span>Barks</span>
      </div>
      <p class="muted small">Short lines said when the hero walks past (at most every 8 seconds).</p>
      {barks.map((b, i) => (
        <div class="talk-row">
          <DraftText
            class="inp"
            aria-label="Bark"
            value={b.text}
            onCommit={(v) => {
              const text = v.trim().slice(0, 120);
              if (!text) return false;
              save({ ...chr, barks: barks.map((x, j) => (j === i ? { ...x, text } : x)) }, 'Edit bark');
            }}
          />
          <DraftText
            class={`inp mono ${checkCondition(b.if) ? 'bad' : ''}`}
            aria-label="Bark condition"
            placeholder="always"
            value={b.if ?? ''}
            onCommit={(v) => {
              const cond = v.trim();
              save(
                {
                  ...chr,
                  barks: barks.map((x, j) => {
                    if (j !== i) return x;
                    const { if: _o, ...rest } = x;
                    return cond ? { ...rest, if: cond } : rest;
                  }),
                },
                'Bark condition',
              );
            }}
          />
          <button
            type="button"
            class="btn icon"
            aria-label="Remove bark"
            onClick={() => save({ ...chr, barks: barks.filter((_, j) => j !== i) }, 'Remove bark')}
          >
            ×
          </button>
        </div>
      ))}
      {barks.length < 12 && (
        <button
          type="button"
          class="btn small"
          onClick={() => save({ ...chr, barks: [...barks, { text: 'Nice day!' }] }, 'Add bark')}
        >
          + Bark
        </button>
      )}
      <label class="field">
        Name colour in dialogue
        <input
          type="color"
          aria-label="Name colour"
          value={chr.nameColor ?? '#ffd277'}
          onChange={(e) => save({ ...chr, nameColor: (e.target as HTMLInputElement).value }, 'Name colour')}
        />
      </label>
    </div>
  );
}
