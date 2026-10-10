import { BUILTIN_SCREENS } from '../../builtin/screens';
import { paths, type Screen } from '../../core/schema';

type Files = { get(path: string): unknown; keys(): Iterable<string> };

/** A screen by id: the project's file, else the built-in with that id. */
export function resolveScreen(files: Pick<Files, 'get'>, id: string): Screen | undefined {
  return (files.get(paths.screen(id)) as Screen | undefined) ?? BUILTIN_SCREENS.find((s) => s.id === id);
}

/** Every screen: built-ins (or their project overrides) first, then the project's own. */
export function allScreens(files: Files): Screen[] {
  const own = [...files.keys()]
    .filter((p) => /^screens\/scr_[0-9a-z]{10}\.json$/.test(p))
    .map((p) => files.get(p) as Screen);
  const byId = new Map(own.map((s) => [s.id, s]));
  return [
    ...BUILTIN_SCREENS.map((b) => byId.get(b.id) ?? b),
    ...own.filter((s) => !BUILTIN_SCREENS.some((b) => b.id === s.id)),
  ];
}

/** The screen of a kind the game uses for a flow step (project screens of that kind win over built-ins). */
export function screenOfKind(files: Files, kind: Screen['kind']): Screen | undefined {
  const list = allScreens(files).filter((s) => s.kind === kind);
  return list.find((s) => !BUILTIN_SCREENS.some((b) => b.id === s.id)) ?? list[0];
}

export const isBuiltinScreen = (id: string) => BUILTIN_SCREENS.some((s) => s.id === id);
