/** Einstellungen des Spielers (nur in diesem Browser gespeichert, Komfortfunktion). */
import { AUDIO } from '../data/balance';

export interface Settings {
  sfx: number;
  music: number;
  muted: boolean;
  autosave: boolean;
  edgeScroll: boolean;
}

const KEY = 'kleine-siedler.settings';

export function defaultSettings(): Settings {
  return {
    sfx: AUDIO.DEFAULT_SFX,
    music: AUDIO.DEFAULT_MUSIC,
    muted: false,
    autosave: true,
    edgeScroll: true,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...defaultSettings(), ...raw };
  } catch {
    return defaultSettings();
  }
}

export function storeSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Ohne Speicher gelten die Einstellungen nur bis zum Neuladen.
  }
}
