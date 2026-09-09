import { VOYAGE_CONFIG } from "./logic";
import type { VoyageSave, VoyageState } from "./types";

export const VOYAGE_SAVE_KEY = "happy-arcade:endless-voyage:v1";

export interface VoyageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validLocation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  return typeof location.id === "string"
    && typeof location.name === "string"
    && finiteNumber(location.x)
    && finiteNumber(location.y)
    && typeof location.season === "string"
    && typeof location.geography === "string"
    && typeof location.character === "string"
    && typeof location.weather === "string"
    && typeof location.localCulture === "string"
    && stringArray(location.amenities)
    && stringArray(location.connections)
    && typeof location.visited === "boolean";
}

function validChoice(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const choice = value as Record<string, unknown>;
  const effects = choice.effects as Record<string, unknown> | undefined;
  return typeof choice.id === "string"
    && typeof choice.action === "string"
    && typeof choice.title === "string"
    && typeof choice.detail === "string"
    && typeof choice.available === "boolean"
    && typeof choice.journalText === "string"
    && Boolean(effects)
    && finiteNumber(effects!.days)
    && finiteNumber(effects!.money)
    && finiteNumber(effects!.energy)
    && finiteNumber(effects!.happiness);
}

function validScene(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const scene = value as Record<string, unknown>;
  return typeof scene.id === "string"
    && typeof scene.templateId === "string"
    && typeof scene.family === "string"
    && typeof scene.title === "string"
    && typeof scene.text === "string"
    && typeof scene.openingPhrase === "string"
    && Array.isArray(scene.choices)
    && scene.choices.length >= 3
    && scene.choices.length <= 5
    && scene.choices.every(validChoice);
}

export function isValidVoyageState(value: unknown): value is VoyageState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<VoyageState>;
  if (state.version !== 1 || !finiteNumber(state.seed) || !finiteNumber(state.randomState)) return false;
  if (!Number.isInteger(state.day) || state.day! < 1 || !Number.isInteger(state.turn) || state.turn! < 0) return false;
  if (!finiteNumber(state.energy) || state.energy! < 0 || state.energy! > 100) return false;
  if (!finiteNumber(state.happiness) || state.happiness! < 0 || state.happiness! > 100) return false;
  if (!finiteNumber(state.money) || state.money! < 0) return false;
  if (!finiteNumber(state.totalDistanceTravelled) || state.totalDistanceTravelled! < 0 || !finiteNumber(state.greatestDistance) || state.greatestDistance! < 0) return false;
  if (!state.locations || typeof state.locations !== "object" || !Object.values(state.locations).every(validLocation) || typeof state.currentLocationId !== "string" || !state.locations[state.currentLocationId]) return false;
  if (!validScene(state.currentScene)) return false;
  if (!Array.isArray(state.journal) || !state.journal.every((entry) => entry && typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.text === "string" && finiteNumber(entry.day))) return false;
  if (!stringArray(state.recentSceneIds) || state.recentSceneIds.length > VOYAGE_CONFIG.maximumRecentScenes) return false;
  if (!Array.isArray(state.recentFamilies) || state.recentFamilies.length > VOYAGE_CONFIG.maximumRecentFamilies) return false;
  if (!stringArray(state.recentChoiceSignatures) || state.recentChoiceSignatures.length > VOYAGE_CONFIG.maximumChoiceSignatures) return false;
  if (!state.friends || typeof state.friends !== "object" || !state.interests || typeof state.interests !== "object") return false;
  if (!stringArray(state.completedBeats) || !stringArray(state.pendingFollowUps) || state.pendingFollowUps.length > VOYAGE_CONFIG.maximumPendingFollowUps || typeof state.lastOutcome !== "string") return false;
  return true;
}

export function serializeVoyage(state: VoyageState, savedAt = Date.now()): string {
  const save: VoyageSave = { version: 1, savedAt, state };
  return JSON.stringify(save);
}

export function deserializeVoyage(raw: string | null): VoyageState | null {
  if (!raw) return null;
  try {
    const save = JSON.parse(raw) as Partial<VoyageSave>;
    return save.version === 1 && isValidVoyageState(save.state) ? save.state : null;
  } catch {
    return null;
  }
}

export function loadVoyage(storage: VoyageStorage): VoyageState | null {
  try {
    return deserializeVoyage(storage.getItem(VOYAGE_SAVE_KEY));
  } catch {
    return null;
  }
}

export function saveVoyage(storage: VoyageStorage, state: VoyageState): boolean {
  try {
    storage.setItem(VOYAGE_SAVE_KEY, serializeVoyage(state));
    return true;
  } catch {
    return false;
  }
}

export function clearVoyage(storage: VoyageStorage): boolean {
  try {
    storage.removeItem(VOYAGE_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
