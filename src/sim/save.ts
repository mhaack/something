/**
 * Spielstand-Format: Weltzustand plus Zusatzdaten (KI-Gedächtnis, Ansicht) als JSON. Die Welt ist
 * vollständig serialisierbar; abgeleitete Caches entstehen nach dem Laden neu.
 */
import { WORLD_VERSION, type World } from './world';

export const SAVE_FORMAT = 'kleine-siedler-save';
export const SAVE_VERSION = 1;

export interface SaveMeta {
  /** Anzeigename (Modus, Mission, Seed). */
  name: string;
  /** Zeitpunkt des Speicherns (ms seit 1970, vom Aufrufer gesetzt). */
  savedAt: number;
  tick: number;
}

export interface SaveFile<Extra = unknown> {
  format: typeof SAVE_FORMAT;
  version: number;
  meta: SaveMeta;
  world: World;
  /** Daten außerhalb der Simulation (KI-Gedächtnis, Kamera, Spieloptionen). */
  extra: Extra;
}

export type SaveError = 'notASave' | 'newerSave' | 'worldVersion';

export class SaveFormatError extends Error {
  constructor(readonly code: SaveError) {
    super(code);
  }
}

export function encodeSave<Extra>(world: World, extra: Extra, meta: SaveMeta): string {
  const file: SaveFile<Extra> = { format: SAVE_FORMAT, version: SAVE_VERSION, meta, world, extra };
  return JSON.stringify(file);
}

export function decodeSave<Extra = unknown>(json: string): SaveFile<Extra> {
  let file: SaveFile<Extra>;
  try {
    file = JSON.parse(json) as SaveFile<Extra>;
  } catch {
    throw new SaveFormatError('notASave');
  }
  if (!file || file.format !== SAVE_FORMAT || !file.world) throw new SaveFormatError('notASave');
  if (file.version > SAVE_VERSION) throw new SaveFormatError('newerSave');
  if (file.world.version !== WORLD_VERSION) throw new SaveFormatError('worldVersion');
  return file;
}
