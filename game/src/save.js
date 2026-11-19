// Save/load: the whole campaign state in one localStorage key, so the
// game is 100% offline and survives a closed tab. Autosave runs after
// every mission and every 30 seconds of play; the title screen offers
// Continue when a save exists.
export const SAVE_KEY = 'port-verona.save.v1';

export function saveGame(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    return true;
  } catch {
    return false; // private windows: the save lasts this visit only
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
