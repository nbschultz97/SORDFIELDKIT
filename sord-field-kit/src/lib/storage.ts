import { get, set, del } from "idb-keyval";

export const PM_TILES_CACHE_KEY = "sord-field-kit:pmtiles";
const SETTINGS_PREFIX = "sord-field-kit:settings:";

export async function savePMTilesBlob(blob: Blob) {
  await set(PM_TILES_CACHE_KEY, blob);
}

export async function readPMTilesBlob(): Promise<Blob | null> {
  const value = await get<Blob | undefined>(PM_TILES_CACHE_KEY);
  return value ?? null;
}

export async function clearPMTilesBlob() {
  await del(PM_TILES_CACHE_KEY);
}

export function readSetting<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(SETTINGS_PREFIX + key);
    if (stored == null) return fallback;
    return JSON.parse(stored) as T;
  } catch (error) {
    console.warn("Failed to read setting", key, error);
    return fallback;
  }
}

export function writeSetting<T>(key: string, value: T) {
  try {
    localStorage.setItem(SETTINGS_PREFIX + key, JSON.stringify(value));
  } catch (error) {
    console.warn("Failed to persist setting", key, error);
  }
}

export function clearSetting(key: string) {
  try {
    localStorage.removeItem(SETTINGS_PREFIX + key);
  } catch (error) {
    console.warn("Failed to clear setting", key, error);
  }
}
