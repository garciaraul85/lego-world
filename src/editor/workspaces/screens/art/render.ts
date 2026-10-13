import { fontCss, artUrl as runtimeArtUrl } from '../../../../engine/ui/art';
import type { EditorState } from '../../../state';

/** The editor's view of art: URLs and fonts from the open project. */
export const artUrl = (ed: EditorState, id: string) => runtimeArtUrl(ed.store, ed.media, id);
export const artFont = (ed: EditorState, ref: string | undefined) => fontCss(ed.store, ed.media, ref);
