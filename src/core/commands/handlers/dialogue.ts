import { dialogueUses } from '../../dialogue/checks';
import { Conversation, MAX_CONVERSATIONS } from '../../dialogue/schema';
import { paths } from '../../schema';
import type { CommandHandler } from '../types';

/**
 * P22: conversations are put whole (the list, the graph and the script all edit the same data; each
 * edit is one undo step). Section names are unique; a conversation in use cannot be deleted.
 */
export const putDialogue: CommandHandler<{ conversation: Conversation }> = {
  label: (p) => `Edit conversation ${p.conversation.name}`,
  validate(store, p) {
    const r = Conversation.safeParse(p.conversation);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    const labels = p.conversation.sections.map((s) => s.label);
    const dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) return `Two sections are called “${dup}”.`;
    if (!store.has(paths.dialogue(p.conversation.id)) && store.list(paths.dialogueDir).length >= MAX_CONVERSATIONS)
      return `A game holds at most ${MAX_CONVERSATIONS} conversations.`;
    return null;
  },
  apply: (store, p) => store.put(paths.dialogue(p.conversation.id), Conversation.parse(p.conversation)),
};

export const deleteDialogue: CommandHandler<{ id: string }> = {
  label: () => 'Delete conversation',
  validate(store, p) {
    if (!store.has(paths.dialogue(p.id))) return 'That conversation does not exist.';
    const u = dialogueUses(store, p.id);
    return u.length
      ? `Still used by ${u
          .map((x) => x.what)
          .slice(0, 3)
          .join(', ')}${u.length > 3 ? '…' : ''}.`
      : null;
  },
  apply: (store, p) => store.remove(paths.dialogue(p.id)),
};
