import { parseSave, type SaveGame, type SaveStore } from '../core/save/save';

const key = (game: string, slot: number) => `brickworlds.save.${game}.${slot}`;

/**
 * P26: saves in the browser's storage, one entry per game and slot. Storage can be missing or full (a private
 * window, blocked site data): reads then find no save and writes report false, and the game goes on.
 */
export class BrowserSaveStore implements SaveStore {
  constructor(private readonly storage: Storage | null = BrowserSaveStore.local()) {}

  static local(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  read(game: string, slot: number): SaveGame | null {
    try {
      const text = this.storage?.getItem(key(game, slot));
      return text ? parseSave(JSON.parse(text)) : null;
    } catch {
      return null;
    }
  }

  write(save: SaveGame): void {
    try {
      this.storage?.setItem(key(save.game, save.slot), JSON.stringify(save));
    } catch {
      /* storage full or blocked: the save is lost, the game goes on */
    }
  }

  remove(game: string, slot: number): void {
    try {
      this.storage?.removeItem(key(game, slot));
    } catch {
      /* nothing to remove */
    }
  }
}
