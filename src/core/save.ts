// ---------------------------------------------------------------------------
// Versioned save system backed by IndexedDB (with a localStorage fallback).
// Each career lives in its own slot. Saves can be exported/imported as JSON.
// ---------------------------------------------------------------------------
import type { Career, League, SaveFile, Settings } from './types';

export const SAVE_VERSION = 1;
const DB_NAME = 'gridiron-legacy';
const STORE = 'saves';
const SETTINGS_KEY = 'gl-settings';
export const SLOTS = 3;

export interface SlotInfo {
  slot: number;
  name: string;
  updated: number;
  summary: string;
  corrupt?: boolean;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    localStorage.setItem(`gl-${key}`, JSON.stringify(value));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) {
    const s = localStorage.getItem(`gl-${key}`);
    return s ? (JSON.parse(s) as T) : undefined;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    localStorage.removeItem(`gl-${key}`);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Migrate older save formats forward. Throws if the data is unusable. */
export function migrate(data: unknown): SaveFile {
  if (!data || typeof data !== 'object') throw new Error('Save data is empty or not an object.');
  const s = data as Partial<SaveFile>;
  if (typeof s.version !== 'number') throw new Error('Save is missing a version number.');
  if (s.version > SAVE_VERSION) throw new Error(`Save was created by a newer version (v${s.version}).`);
  if (!s.career || !s.league) throw new Error('Save is missing career or league data.');
  const league = s.league as League;
  const career = s.career as Career;
  if (!league.players || !league.teams || league.teams.length !== 32) throw new Error('League data is corrupt.');
  if (!league.players[career.playerId]) throw new Error('Your player is missing from the save.');
  // v1 is current. Future migrations go here: if (s.version === 1) { ...; s.version = 2; }
  career.eventsSeen ??= [];
  career.milestones ??= [];
  career.decisions ??= [];
  league.hallOfFame ??= [];
  return s as SaveFile;
}

export function summarize(save: SaveFile): string {
  const p = save.league.players[save.career.playerId];
  if (!p) return 'Unknown player';
  return `${p.pos} • OVR ${p.ovr} • Season ${save.league.season} • Level ${save.career.level}`;
}

export async function saveCareer(career: Career, league: League): Promise<void> {
  const p = league.players[career.playerId];
  const file: SaveFile = {
    version: SAVE_VERSION,
    slot: career.slot,
    updated: Date.now(),
    name: p ? `${p.first} ${p.last}` : 'Career',
    career,
    league,
  };
  await idbPut(`slot-${career.slot}`, file);
  await idbPut(`meta-${career.slot}`, { slot: career.slot, name: file.name, updated: file.updated, summary: summarize(file) } satisfies SlotInfo);
  try { localStorage.setItem('gl-last-slot', String(career.slot)); } catch { /* ignore */ }
}

export async function loadCareer(slot: number): Promise<SaveFile> {
  const raw = await idbGet<unknown>(`slot-${slot}`);
  if (!raw) throw new Error('No career in this slot.');
  return migrate(raw);
}

export async function listSlots(): Promise<(SlotInfo | null)[]> {
  const out: (SlotInfo | null)[] = [];
  for (let i = 0; i < SLOTS; i++) {
    try {
      const meta = await idbGet<SlotInfo>(`meta-${i}`);
      out.push(meta ?? null);
    } catch {
      out.push({ slot: i, name: 'Unreadable save', updated: 0, summary: '', corrupt: true });
    }
  }
  return out;
}

export async function deleteSlot(slot: number): Promise<void> {
  await idbDelete(`slot-${slot}`);
  await idbDelete(`meta-${slot}`);
}

export function lastSlot(): number | null {
  try {
    const v = localStorage.getItem('gl-last-slot');
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export async function exportSlot(slot: number): Promise<string> {
  const raw = await idbGet<unknown>(`slot-${slot}`);
  if (!raw) throw new Error('No career in this slot.');
  return JSON.stringify(raw);
}

export async function importToSlot(slot: number, json: string): Promise<SaveFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const save = migrate(parsed);
  save.slot = slot;
  save.career.slot = slot;
  await saveCareer(save.career, save.league);
  return save;
}

export const DEFAULT_KEYS: Record<string, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', snap: 'Space',
  juke: 'KeyJ', spin: 'KeyK', stiff: 'KeyL', dive: 'KeyU', action: 'KeyE', swat: 'KeyQ', protect: 'KeyR',
  throwAway: 'KeyT', camera: 'KeyC', pause: 'Escape',
};

export const defaultSettings = (): Settings => ({
  difficulty: 'pro',
  quarterMinutes: 5,
  sound: true,
  volume: 0.7,
  graphics: 'medium',
  camera: 'broadcast',
  controlScale: 1,
  leftHanded: false,
  showGuide: true,
  keys: { ...DEFAULT_KEYS },
  autoContinue: true,
  playSpeed: 1,
});

export function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (!s) return defaultSettings();
    const parsed = JSON.parse(s) as Partial<Settings>;
    return { ...defaultSettings(), ...parsed, keys: { ...DEFAULT_KEYS, ...(parsed.keys ?? {}) } };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}
