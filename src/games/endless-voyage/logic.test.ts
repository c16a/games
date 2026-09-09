import { describe, expect, test } from "bun:test";
import { SCENE_FAMILIES, SCENE_TEMPLATES } from "./content";
import { createVoyage, distanceFromHome, generateScene, resourceBand, resolveChoice, routeDistance, VOYAGE_CONFIG } from "./logic";
import { deserializeVoyage, loadVoyage, saveVoyage, serializeVoyage, type VoyageStorage } from "./persistence";
import type { SceneChoice, VoyageState } from "./types";

function choice(state: VoyageState, action: SceneChoice["action"]): SceneChoice {
  const found = state.currentScene.choices.find((candidate) => candidate.action === action);
  if (!found) throw new Error(`Missing ${action} choice`);
  return found;
}

function zeroed(seed = 19): VoyageState {
  const initial = createVoyage(seed);
  return generateScene({ ...initial, energy: 0, happiness: 0, money: 0 });
}

function safeTurn(state: VoyageState): VoyageState {
  const recovery = choice(state, "recover");
  const work = choice(state, "work");
  const travel = choice(state, "travel");
  const selected = state.energy < 40 || state.happiness < 40
    ? recovery
    : state.money < 16 && work.available
      ? work
      : travel.available && state.turn % 4 === 0
        ? travel
        : state.currentScene.choices.find(({ available }) => available)!;
  return resolveChoice(state, selected.id);
}

describe("Endless Voyage authored generation", () => {
  test("provides 60 templates across 10 scene families", () => {
    expect(SCENE_TEMPLATES).toHaveLength(60);
    expect(new Set(SCENE_TEMPLATES.map(({ id }) => id)).size).toBe(60);
    expect(new Set(SCENE_TEMPLATES.map(({ family }) => family)).size).toBe(10);
    expect(SCENE_FAMILIES).toHaveLength(10);
  });

  test("is deterministic for equal seeds and choices, including random state", () => {
    let first = createVoyage(123456);
    let second = createVoyage(123456);
    expect(first).toEqual(second);
    for (let turn = 0; turn < 15; turn += 1) {
      const index = first.currentScene.choices.findIndex(({ available }) => available);
      first = resolveChoice(first, first.currentScene.choices[index]!.id);
      second = resolveChoice(second, second.currentScene.choices[index]!.id);
      expect(first).toEqual(second);
    }
  });

  test("uses rainy astronomy alternatives instead of impossible stargazing", () => {
    let state = createVoyage(44);
    state = { ...state, locations: { ...state.locations, [state.currentLocationId]: { ...state.locations[state.currentLocationId]!, weather: "rainy" } } };
    for (let attempt = 0; attempt < 60 && state.currentScene.family !== "astronomy"; attempt += 1) {
      const recovery = choice(state, "recover");
      state = resolveChoice(state, recovery.id);
    }
    expect(state.currentScene.family).toBe("astronomy");
    expect(state.currentScene.text).toMatch(/indoors|dome|cloud|café|hall|weather/i);
  });
});

describe("Endless Voyage resources and turns", () => {
  test("clamps gains, never overspends, and resolves a turn only once", () => {
    let state = createVoyage(7);
    state = generateScene({ ...state, energy: 95, happiness: 98, money: 0 });
    const meal = choice(state, "eat");
    expect(meal.available).toBe(false);
    expect(meal.unavailableReason).toMatch(/free gentle option/i);
    expect(resolveChoice(state, meal.id)).toBe(state);

    const recovery = choice(state, "recover");
    const day = state.day;
    const resolved = resolveChoice(state, recovery.id);
    expect(resolved.day).toBe(day + 1);
    expect(resolved.energy).toBe(100);
    expect(resolved.happiness).toBe(100);
    expect(resolveChoice(resolved, recovery.id)).toBe(resolved);
  });

  test("recovers both empty meters for free within two turns, then allows earning and travel", () => {
    let state = zeroed();
    expect(resourceBand(state.energy)).toBe("empty");
    expect(choice(state, "travel").available).toBe(false);
    for (let turn = 0; turn < 2; turn += 1) {
      const recovery = choice(state, "recover");
      expect(recovery.available).toBe(true);
      expect(recovery.effects.money).toBe(0);
      expect(recovery.effects.energy).toBeGreaterThan(0);
      expect(recovery.effects.happiness).toBeGreaterThan(0);
      state = resolveChoice(state, recovery.id);
    }
    expect(resourceBand(state.energy)).toBe("comfortable");
    expect(resourceBand(state.happiness)).toBe("comfortable");
    const work = choice(state, "work");
    expect(work.available).toBe(true);
    state = resolveChoice(state, work.id);
    expect(state.money).toBe(VOYAGE_CONFIG.workPay);
    if (!choice(state, "travel").available) state = resolveChoice(state, choice(state, "recover").id);
    expect(choice(state, "travel").available).toBe(true);
  });

  test("travel uses route length for cost and coordinates for current distance", () => {
    let state = createVoyage(900);
    const travel = choice(state, "travel");
    const from = state.locations[state.currentLocationId]!;
    const destination = state.locations[travel.destinationId!]!;
    const length = routeDistance(from, destination);
    const previousDays = state.day;
    state = resolveChoice(state, travel.id);
    expect(state.currentLocationId).toBe(destination.id);
    expect(state.day).toBe(previousDays + travel.effects.days);
    expect(state.totalDistanceTravelled).toBe(length);
    expect(distanceFromHome(state.locations[state.currentLocationId]!)).toBe(Math.round(Math.hypot(destination.x, destination.y)));
    expect(state.greatestDistance).toBeGreaterThanOrEqual(distanceFromHome(destination));
  });

  test("low happiness makes ordinary work cost more energy without blocking recovery", () => {
    const base = createVoyage(83);
    const comfortable = generateScene({ ...base, energy: 80, happiness: 80 });
    const low = generateScene({ ...base, energy: 80, happiness: 20 });
    expect(Math.abs(choice(low, "work").effects.energy)).toBe(Math.abs(choice(comfortable, "work").effects.energy) + VOYAGE_CONFIG.lowHappinessWorkSurcharge);
    expect(choice(low, "recover").available).toBe(true);
  });
});

describe("Endless Voyage continuity and longevity", () => {
  test("retains friends and place identity and does not repeat one-time scenes", () => {
    let state = createVoyage(31415);
    for (let turn = 0; turn < 60 && !state.currentScene.choices.some(({ action }) => action === "connect"); turn += 1) state = safeTurn(state);
    const connect = choice(state, "connect");
    state = resolveChoice(state, connect.id);
    const friend = Object.values(state.friends)[0]!;
    const place = state.locations[friend.locationId]!;
    expect(friend.relationship).toBe(1);
    for (let turn = 0; turn < 12; turn += 1) state = safeTurn(state);
    expect(state.locations[place.id]).toMatchObject({ id: place.id, name: place.name, geography: place.geography, character: place.character, x: place.x, y: place.y });
    expect(state.friends[friend.id]).toMatchObject({ id: friend.id, name: friend.name, personality: friend.personality, interest: friend.interest, locationId: friend.locationId });
    expect(state.friends[friend.id]!.relationship).toBeGreaterThanOrEqual(friend.relationship);
    expect(new Set(state.recentSceneIds).size).toBe(state.recentSceneIds.length);
  });

  test("develops a remembered friendship through a later postcard", () => {
    let state = createVoyage(2718);
    for (let turn = 0; turn < 60 && !state.currentScene.choices.some(({ action }) => action === "connect"); turn += 1) state = safeTurn(state);
    state = resolveChoice(state, choice(state, "connect").id);
    const friend = Object.values(state.friends)[0]!;
    expect(state.pendingFollowUps).toContain(`postcard:${friend.id}`);

    for (let turn = 0; turn < 20 && !state.currentScene.choices.some(({ friendId }) => friendId === friend.id); turn += 1) {
      state = resolveChoice(state, choice(state, "recover").id);
    }
    const postcard = state.currentScene.choices.find(({ friendId }) => friendId === friend.id)!;
    expect(postcard.title).toContain(friend.name);
    state = resolveChoice(state, postcard.id);
    expect(state.friends[friend.id]!.relationship).toBe(friend.relationship + 1);
    expect(state.pendingFollowUps).not.toContain(`postcard:${friend.id}`);
    expect(state.completedBeats).toContain(`postcard:${friend.id}`);
  });

  test("keeps long voyages playable, bounded, varied, and without an ending state", () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      let state = createVoyage(seed);
      const seenFamilies = new Set<string>();
      const lastSeen = new Map<string, number>();
      for (let turn = 0; turn < 360; turn += 1) {
        const previous = lastSeen.get(state.currentScene.templateId);
        if (previous !== undefined && turn < 60) expect(turn - previous).toBeGreaterThan(20);
        lastSeen.set(state.currentScene.templateId, turn);
        seenFamilies.add(state.currentScene.family);
        expect(state.currentScene.choices.length).toBeGreaterThanOrEqual(3);
        expect(state.currentScene.choices.some(({ available }) => available)).toBe(true);
        expect(choice(state, "recover").available).toBe(true);
        state = safeTurn(state);
        expect(state.energy).toBeGreaterThanOrEqual(0);
        expect(state.energy).toBeLessThanOrEqual(100);
        expect(state.happiness).toBeGreaterThanOrEqual(0);
        expect(state.happiness).toBeLessThanOrEqual(100);
        expect(state.money).toBeGreaterThanOrEqual(0);
        expect(state.recentSceneIds.length).toBeLessThanOrEqual(VOYAGE_CONFIG.maximumRecentScenes);
        expect(state.recentFamilies.length).toBeLessThanOrEqual(VOYAGE_CONFIG.maximumRecentFamilies);
        expect(state.recentChoiceSignatures.length).toBeLessThanOrEqual(VOYAGE_CONFIG.maximumChoiceSignatures);
        expect(state.pendingFollowUps.length).toBeLessThanOrEqual(VOYAGE_CONFIG.maximumPendingFollowUps);
        expect(state.journal.length).toBeLessThanOrEqual(VOYAGE_CONFIG.maximumJournalEntries);
        expect("status" in state).toBe(false);
      }
      expect(seenFamilies.size).toBe(10);
    }
  });

  test("balances scene families and maintains the 20-turn exact-scene cooldown", () => {
    let state = createVoyage(2026);
    const familyCounts = new Map<string, number>();
    const lastSeen = new Map<string, number>();
    let minimumRepeatInterval = Number.POSITIVE_INFINITY;
    let previousChoices = "";
    for (let turn = 0; turn < 600; turn += 1) {
      const templateId = state.currentScene.templateId;
      const previous = lastSeen.get(templateId);
      if (previous !== undefined) minimumRepeatInterval = Math.min(minimumRepeatInterval, turn - previous);
      lastSeen.set(templateId, turn);
      familyCounts.set(state.currentScene.family, (familyCounts.get(state.currentScene.family) ?? 0) + 1);
      const signature = state.currentScene.choices.map(({ title }) => title).join("|");
      expect(signature).not.toBe(previousChoices);
      previousChoices = signature;
      state = resolveChoice(state, choice(state, "recover").id);
    }
    expect(minimumRepeatInterval).toBeGreaterThan(20);
    expect(familyCounts.size).toBe(10);
    for (const count of familyCounts.values()) {
      expect(count).toBeGreaterThan(35);
      expect(count).toBeLessThan(90);
    }
    expect(state.journal).toHaveLength(VOYAGE_CONFIG.maximumJournalEntries);
    expect(state.journal[0]).toMatchObject({ id: "archive", title: "Earlier pages" });
    expect(Number.parseInt(state.journal[0]!.text)).toBeGreaterThan(400);
  });

  test("keeps generated route connections coherent in both directions", () => {
    let state = createVoyage(9090);
    for (let turn = 0; turn < 80; turn += 1) state = safeTurn(state);
    for (const location of Object.values(state.locations)) {
      for (const connectedId of location.connections) {
        expect(state.locations[connectedId]).toBeDefined();
        expect(state.locations[connectedId]!.connections).toContain(location.id);
      }
    }
  });
});

describe("Endless Voyage persistence", () => {
  test("round-trips the current scene and generator state unchanged", () => {
    let state = createVoyage(8128);
    state = safeTurn(safeTurn(state));
    expect(deserializeVoyage(serializeVoyage(state, 123))).toEqual(state);
  });

  test("rejects invalid saves and tolerates unavailable storage", () => {
    expect(deserializeVoyage("not-json")).toBeNull();
    expect(deserializeVoyage(JSON.stringify({ version: 1, state: { energy: 999 } }))).toBeNull();
    const malformed = JSON.parse(JSON.stringify(createVoyage(4))) as { currentScene: { choices: unknown[] } };
    malformed.currentScene.choices = [{ id: "broken" }];
    expect(deserializeVoyage(JSON.stringify({ version: 1, state: malformed }))).toBeNull();
    const unavailable: VoyageStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    };
    expect(loadVoyage(unavailable)).toBeNull();
    expect(saveVoyage(unavailable, createVoyage(1))).toBe(false);
  });
});
