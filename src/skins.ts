// Skins saved from the character editor live in this browser's storage and
// override the default skin files. The game and the editor share them because
// they're on the same site.

const PREFIX = 'cyberPvZ.skin.';

export function getCustomSkin(id: string): string | null {
  try {
    return localStorage.getItem(PREFIX + id);
  } catch {
    return null;
  }
}

/** Returns false if the browser wouldn't let us save. */
export function saveCustomSkin(id: string, dataUrl: string): boolean {
  try {
    localStorage.setItem(PREFIX + id, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function clearCustomSkin(id: string): void {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    // Nothing saved, nothing to clear.
  }
}

/**
 * The skin to show for a character: the editor's saved version if there is
 * one, otherwise the default file. `base` is the path to the site root
 * ('' from the game, '../' from the editor).
 */
export function skinUrl(id: string, file: string, base = ''): string {
  return getCustomSkin(id) ?? base + file;
}
