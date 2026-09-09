import { SCENE_TEMPLATES } from "./content";
import { createSeededRandom, normalizeSeed, pick, type SeededRandom } from "./random";
import type { ChoiceEffects, Friend, JournalEntry, Location, ResourceBand, SceneChoice, SceneFamily, SceneTemplate, VoyageScene, VoyageState } from "./types";

export const VOYAGE_CONFIG = {
  resourceMinimum: 0,
  resourceMaximum: 100,
  comfortableThreshold: 40,
  startingEnergy: 72,
  startingHappiness: 68,
  startingMoney: 36,
  freeRecoveryGain: 20,
  mealCost: 8,
  mealEnergy: 25,
  workPay: 18,
  workEnergy: 12,
  lowHappinessWorkSurcharge: 4,
  maximumRecentScenes: 20,
  maximumRecentFamilies: 20,
  maximumChoiceSignatures: 10,
  maximumPendingFollowUps: 12,
  maximumJournalEntries: 150,
} as const;

const PLACE_PREFIXES = ["Willow", "Juniper", "Amber", "Silver", "Meadow", "Cedar", "Moon", "Bright", "Rose", "Maple", "Star", "Blue"];
const PLACE_SUFFIXES = ["Quay", "Vale", "Crossing", "Harbour", "Hollow", "Bridge", "Bay", "Heath", "Moor", "Glen", "Fields", "Point"];
const FRIEND_NAMES = ["Anika", "Lina", "Noor", "Tara", "Inez", "Mei", "Sofia", "Amara", "Leela", "Zoya", "Nia", "Rumi"];
const PERSONALITIES = ["cheerful and observant", "quietly funny", "curious and patient", "warm and inventive", "thoughtful and adventurous"];
const INTERESTS = ["books", "gardening", "astronomy", "music", "drawing", "local history"];
const LOCAL_CULTURES = ["storytelling evenings", "community gardens", "boatbuilding traditions", "street music", "shared-table lunches", "handmade crafts"];

function clampResource(value: number): number {
  return Math.max(VOYAGE_CONFIG.resourceMinimum, Math.min(VOYAGE_CONFIG.resourceMaximum, Math.round(value)));
}

export function resourceBand(value: number): ResourceBand {
  if (value <= 0) return "empty";
  return value < VOYAGE_CONFIG.comfortableThreshold ? "low" : "comfortable";
}

export function distanceFromHome(location: Location): number {
  return Math.round(Math.hypot(location.x, location.y));
}

export function routeDistance(from: Location, to: Location): number {
  return Math.max(20, Math.round(Math.hypot(to.x - from.x, to.y - from.y)));
}

function homeLocation(): Location {
  return {
    id: "home",
    name: "Sunrise Corner",
    geography: "plain",
    character: "town",
    x: 0,
    y: 0,
    season: "spring",
    weather: "clear",
    localCulture: "community gardens",
    amenities: ["library", "garden", "station"],
    connections: [],
    visited: true,
  };
}

function uniquePlaceName(state: VoyageState, random: SeededRandom): string {
  const used = new Set(Object.values(state.locations).map(({ name }) => name));
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const name = `${pick(PLACE_PREFIXES, random)} ${pick(PLACE_SUFFIXES, random)}`;
    if (!used.has(name)) return name;
  }
  return `Far Lantern ${Object.keys(state.locations).length}`;
}

function generateLocation(state: VoyageState, random: SeededRandom): Location {
  const current = state.locations[state.currentLocationId]!;
  const route = 45 + Math.round(random.next() * 205);
  const angle = random.next() * Math.PI * 2;
  const geography = pick(["coast", "mountain", "river", "plain"] as const, random);
  const character = pick(["village", "town", "city"] as const, random);
  const season = pick(["spring", "summer", "autumn", "winter"] as const, random);
  const weather = pick(["clear", "clear", "cloudy", "rainy", "breezy"] as const, random);
  const id = `place-${Object.keys(state.locations).length}`;
  const amenities = geography === "coast"
    ? ["library", "ferry", "market", "star club"]
    : character === "city"
      ? ["library", "station", "cinema", "planetarium"]
      : ["library", "garden", "bus stop", "community hall"];
  return {
    id,
    name: uniquePlaceName(state, random),
    geography,
    character,
    x: Math.round(current.x + Math.cos(angle) * route),
    y: Math.round(current.y + Math.sin(angle) * route),
    season,
    weather,
    localCulture: pick(LOCAL_CULTURES, random),
    amenities,
    connections: [current.id],
    visited: false,
  };
}

function effectText(effects: ChoiceEffects): string {
  const parts = [`${effects.days} ${effects.days === 1 ? "day" : "days"}`];
  if (effects.money !== 0) parts.push(`${effects.money > 0 ? "+" : "−"}₹${Math.abs(effects.money)}`);
  if (effects.energy !== 0) parts.push(`${effects.energy > 0 ? "+" : "−"}${Math.abs(effects.energy)} energy`);
  if (effects.happiness !== 0) parts.push(`${effects.happiness > 0 ? "+" : "−"}${Math.abs(effects.happiness)} happiness`);
  return parts.join(" · ");
}

function unavailableReason(state: VoyageState, effects: ChoiceEffects, action: SceneChoice["action"]): string | undefined {
  if (effects.money < 0 && state.money < Math.abs(effects.money)) return "This costs more than is available today. A free gentle option is ready below.";
  if ((action === "travel" || action === "work") && resourceBand(state.energy) === "empty") return "A restful meal or quiet day will bring back enough energy first.";
  if (action === "travel" && resourceBand(state.happiness) === "empty") return "A restorative day will make travelling feel inviting again.";
  if (action === "connect" && resourceBand(state.happiness) === "empty") return "Something familiar and restful would feel better before a busy outing.";
  return undefined;
}

function withAvailability(state: VoyageState, choice: Omit<SceneChoice, "available" | "detail"> & { detail?: string }): SceneChoice {
  const reason = unavailableReason(state, choice.effects, choice.action);
  return { ...choice, detail: choice.detail ?? effectText(choice.effects), available: reason === undefined, unavailableReason: reason };
}

function friendForLocation(state: VoyageState, location: Location): Friend | undefined {
  return Object.values(state.friends).find(({ locationId }) => locationId === location.id);
}

function specialChoice(state: VoyageState, template: SceneTemplate, followUpFriend?: Friend): SceneChoice {
  const happinessEmpty = resourceBand(state.happiness) === "empty";
  const paid = template.family === "arts" || template.family === "festival" || template.family === "astronomy";
  const strenuous = template.family === "nature";
  const money = paid ? -6 : template.family === "work" ? VOYAGE_CONFIG.workPay : 0;
  const energy = template.family === "rest" ? 24 : template.family === "food" ? 18 : strenuous ? -16 : template.family === "work" ? -VOYAGE_CONFIG.workEnergy : -5;
  const happiness = template.family === "rest" ? 12 : template.family === "food" ? 6 : 18;
  const effects = { days: 1, money, energy, happiness };
  const action: SceneChoice["action"] = template.family === "work" ? "work" : template.family === "food" ? "eat" : template.family === "rest" ? "rest" : "connect";
  const reason = strenuous && resourceBand(state.energy) !== "comfortable"
    ? "A quiet day would help before that longer outing."
    : happinessEmpty && action === "connect"
      ? "A restorative day will make this lively plan feel inviting again."
      : unavailableReason(state, effects, action);
  return {
    id: "special",
    action,
    title: followUpFriend ? `Read ${followUpFriend.name}'s postcard` : template.activity[0]!.toUpperCase() + template.activity.slice(1),
    detail: effectText(effects),
    effects,
    available: reason === undefined,
    unavailableReason: reason,
    journalText: followUpFriend
      ? `${followUpFriend.name}'s postcard recalled their time together and shared a hopeful new story.`
      : `${template.title}: Mira chose to ${template.activity}.`,
    interest: template.interest,
    friendId: followUpFriend?.id,
  };
}

function recoveryChoice(state: VoyageState): SceneChoice {
  const needsBoth = resourceBand(state.energy) !== "comfortable" || resourceBand(state.happiness) !== "comfortable";
  const effects = needsBoth
    ? { days: 1, money: 0, energy: VOYAGE_CONFIG.freeRecoveryGain, happiness: VOYAGE_CONFIG.freeRecoveryGain }
    : { days: 1, money: 0, energy: 24, happiness: 8 };
  return withAvailability(state, {
    id: "recover",
    action: "recover",
    title: needsBoth ? "Take a free quiet day" : "Rest somewhere peaceful",
    effects,
    journalText: needsBoth
      ? "A quiet day brought a small conversation, a good stretch, and room to feel refreshed."
      : "Mira rested without rushing and noticed three lovely details about the town.",
  });
}

function standardChoices(state: VoyageState, random: SeededRandom): { choices: SceneChoice[]; locations: VoyageState["locations"] } {
  const location = state.locations[state.currentLocationId]!;
  const workEnergy = VOYAGE_CONFIG.workEnergy + (resourceBand(state.happiness) === "low" ? VOYAGE_CONFIG.lowHappinessWorkSurcharge : 0);
  const meal = withAvailability(state, {
    id: "meal",
    action: "eat",
    title: "Buy a warm local meal",
    effects: { days: 1, money: -VOYAGE_CONFIG.mealCost, energy: VOYAGE_CONFIG.mealEnergy, happiness: 6 },
    journalText: `A warm meal in ${location.name} came with a new local flavour and an easy hello.`,
    interest: "food",
  });
  const work = withAvailability(state, {
    id: "work",
    action: "work",
    title: "Help with a safe community job",
    effects: { days: 1, money: VOYAGE_CONFIG.workPay, energy: -workEnergy, happiness: 3 },
    journalText: `Mira helped the community in ${location.name} and earned some travelling money.`,
    interest: "community",
  });

  const connectedDestinations = location.connections.map((id) => state.locations[id]).filter((place): place is Location => Boolean(place));
  let destination = connectedDestinations.length >= 3 || (connectedDestinations.length > 0 && random.next() < 0.35)
    ? pick(connectedDestinations, random)
    : undefined;
  let nextState = state;
  if (!destination) {
    destination = generateLocation(state, random);
    nextState = {
      ...state,
      locations: {
        ...state.locations,
        [location.id]: { ...location, connections: [...location.connections, destination.id] },
        [destination.id]: destination,
      },
    };
  }
  const length = routeDistance(location, destination);
  const transport = length < 75 ? "walk" : location.geography === "coast" && destination.geography === "coast" ? "ferry" : destination.character === "city" ? "train" : length < 120 ? "bus" : "coach";
  const travelDays = transport === "walk" ? Math.max(1, Math.ceil(length / 35)) : Math.max(1, Math.ceil(length / 140));
  const fare = transport === "walk" ? 0 : transport === "bus" ? 7 : transport === "ferry" ? 12 : transport === "train" ? 14 : 10;
  const travelEnergy = transport === "walk" ? -18 : -8;
  let travel = withAvailability(nextState, {
    id: "travel",
    action: "travel",
    title: transport === "walk" ? `Walk to ${destination.name}` : `Take the ${transport} to ${destination.name}`,
    detail: `${travelDays} ${travelDays === 1 ? "day" : "days"} · ${fare === 0 ? "free" : `−₹${fare}`} · −${Math.abs(travelEnergy)} energy · arrives ${distanceFromHome(destination)} km from home`,
    effects: { days: travelDays, money: -fare, energy: travelEnergy, happiness: transport === "walk" ? 9 : 7, distanceTravelled: length },
    destinationId: destination.id,
    journalText: transport === "walk" ? `Mira followed the ${length} km path to ${destination.name}.` : `The ${transport} carried Mira ${length} km to ${destination.name}.`,
  });
  if (transport === "walk" && resourceBand(nextState.energy) !== "comfortable") {
    travel = { ...travel, available: false, unavailableReason: "A quiet day would help before that long walk." };
  }
  return { choices: [meal, work, recoveryChoice(nextState), travel], locations: nextState.locations };
}

function selectTemplate(state: VoyageState, random: SeededRandom): SceneTemplate {
  const notCompleted = SCENE_TEMPLATES.filter(({ id }) => !state.completedBeats.includes(id));
  const basePool = notCompleted.length > 0 ? notCompleted : SCENE_TEMPLATES;
  const fresh = basePool.filter(({ id }) => !state.recentSceneIds.includes(id));
  const pool = fresh.length > 0 ? fresh : basePool;
  const recentFamilyCounts = new Map<SceneFamily, number>();
  for (const family of state.recentFamilies.slice(-6)) recentFamilyCounts.set(family, (recentFamilyCounts.get(family) ?? 0) + 1);
  return pool
    .map((template) => ({
      template,
      score: random.next()
        + (state.interests[template.interest] ?? 0) * 0.025
        + (state.pendingFollowUps.length > 0 && template.family === "friendship" ? 0.45 : 0)
        - (recentFamilyCounts.get(template.family) ?? 0) * 0.16,
    }))
    .sort((a, b) => b.score - a.score)[0]!.template;
}

function choiceSignature(choices: readonly SceneChoice[]): string {
  return choices.map(({ action, title }) => `${action}:${title}`).sort().join("|");
}

export function generateScene(state: VoyageState): VoyageState {
  const random = createSeededRandom(state.randomState);
  let working = state;
  const template = selectTemplate(working, random);
  const standard = standardChoices(working, random);
  working = { ...working, locations: standard.locations };

  const location = working.locations[working.currentLocationId]!;
  const friend = friendForLocation(working, location);
  const followUpId = working.pendingFollowUps[0]?.replace(/^postcard:/, "");
  const followUpFriend = template.family === "friendship" && followUpId ? working.friends[followUpId] : undefined;
  const opening = pick(template.openings, random);
  const weatherText = location.weather === "rainy" || location.weather === "cloudy" ? template.wetText : template.clearText;
  const cultureDetail = random.next() < 0.22 ? ` ${location.name} is known for ${location.localCulture}, which gives the day its own rhythm.` : "";
  const callback = followUpFriend
    ? ` A postcard from ${followUpFriend.name}, ${followUpFriend.personality}, is waiting at the local library.`
    : friend && (template.family === "friendship" || random.next() < 0.14)
    ? ` ${friend.name}, ${friend.personality}, remembers their last conversation and waves hello.`
    : "";
  const choices = [specialChoice(working, template, followUpFriend), ...standard.choices].slice(0, 5);
  const turnKey = `${working.turn}-${template.id}`;
  const keyedChoices = choices.map((choice) => ({ ...choice, id: `${turnKey}:${choice.id}` }));
  const scene: VoyageScene = {
    id: turnKey,
    templateId: template.id,
    family: template.family,
    title: template.title,
    openingPhrase: opening,
    text: `${opening} ${weatherText}${cultureDetail}${callback}`,
    choices: keyedChoices,
  };
  return { ...working, randomState: random.state(), currentScene: scene };
}

function appendJournal(entries: readonly JournalEntry[], entry: JournalEntry): JournalEntry[] {
  const next = [...entries, entry];
  if (next.length <= VOYAGE_CONFIG.maximumJournalEntries) return next;
  const previousArchive = next.find(({ id }) => id === "archive");
  const previousCount = Number.parseInt(previousArchive?.text.match(/^\d+/)?.[0] ?? "0", 10);
  const ordinary = next.filter(({ id }) => id !== "archive");
  const removed = ordinary.length - (VOYAGE_CONFIG.maximumJournalEntries - 1);
  const archivedCount = previousCount + removed;
  return [
    { id: "archive", day: entry.day, place: "Travel journal", title: "Earlier pages", text: `${archivedCount} earlier journal moments are safely gathered in the archive.`, kind: "milestone" },
    ...ordinary.slice(removed),
  ];
}

function meetOrUpdateFriend(state: VoyageState, random: SeededRandom): { friends: VoyageState["friends"]; friend: Friend; isNew: boolean; text: string } {
  const location = state.locations[state.currentLocationId]!;
  const existing = friendForLocation(state, location);
  if (existing) {
    return {
      friends: { ...state.friends, [existing.id]: { ...existing, relationship: Math.min(5, existing.relationship + 1) } },
      friend: { ...existing, relationship: Math.min(5, existing.relationship + 1) },
      isNew: false,
      text: `${existing.name} remembers Mira and their friendship grows a little warmer.`,
    };
  }
  const id = `friend-${location.id}`;
  const unusedNames = FRIEND_NAMES.filter((name) => !Object.values(state.friends).some((known) => known.name === name));
  const friend: Friend = {
    id,
    name: pick(unusedNames.length > 0 ? unusedNames : FRIEND_NAMES, random),
    personality: pick(PERSONALITIES, random),
    interest: pick(INTERESTS, random),
    locationId: location.id,
    relationship: 1,
    metOnDay: state.day,
  };
  return { friends: { ...state.friends, [id]: friend }, friend, isNew: true, text: `Mira meets ${friend.name}, who is ${friend.personality} and loves ${friend.interest}.` };
}

export function resolveChoice(state: VoyageState, choiceId: string): VoyageState {
  const choice = state.currentScene.choices.find(({ id }) => id === choiceId);
  if (!choice || !choice.available) return state;
  const random = createSeededRandom(state.randomState);
  const previousLocation = state.locations[state.currentLocationId]!;
  const destination = choice.destinationId ? state.locations[choice.destinationId] : undefined;
  const currentLocationId = destination?.id ?? state.currentLocationId;
  const locations = destination
    ? { ...state.locations, [destination.id]: { ...destination, visited: true } }
    : state.locations;
  const day = state.day + choice.effects.days;
  const energy = clampResource(state.energy + choice.effects.energy);
  const happiness = clampResource(state.happiness + choice.effects.happiness);
  const money = Math.max(0, state.money + choice.effects.money);
  const distance = distanceFromHome(locations[currentLocationId]!);
  const totalDistanceTravelled = state.totalDistanceTravelled + (choice.effects.distanceTravelled ?? 0);
  let friends = state.friends;
  let socialText = "";
  let pendingFollowUps = state.pendingFollowUps;
  let completedFriendBeat: string | undefined;
  if (choice.friendId && state.friends[choice.friendId]) {
    const friend = state.friends[choice.friendId]!;
    friends = { ...state.friends, [friend.id]: { ...friend, relationship: Math.min(5, friend.relationship + 1) } };
    pendingFollowUps = state.pendingFollowUps.filter((followUp) => followUp !== `postcard:${friend.id}`);
    completedFriendBeat = `postcard:${friend.id}`;
    socialText = ` ${friend.name}'s remembered details make the distance feel smaller.`;
  } else if (choice.action === "connect" && choice.available) {
    const update = meetOrUpdateFriend({ ...state, currentLocationId, locations }, random);
    friends = update.friends;
    socialText = ` ${update.text}`;
    if (update.isNew && !pendingFollowUps.includes(`postcard:${update.friend.id}`)) {
      pendingFollowUps = [...pendingFollowUps, `postcard:${update.friend.id}`].slice(-VOYAGE_CONFIG.maximumPendingFollowUps);
    }
  }
  const outcome = `${choice.journalText}${socialText} Energy is now ${energy}, happiness ${happiness}, and money ₹${money}.`;
  const entry: JournalEntry = {
    id: `entry-${state.turn}-${choice.id}`,
    day,
    place: locations[currentLocationId]!.name,
    title: choice.title,
    text: `${choice.journalText}${socialText}`,
    kind: destination ? "place" : choice.action === "connect" ? "friend" : "choice",
  };
  const interest = choice.interest;
  let completedBeats = state.completedBeats.includes(state.currentScene.templateId)
    ? state.completedBeats
    : [...state.completedBeats, state.currentScene.templateId];
  if (completedFriendBeat && !completedBeats.includes(completedFriendBeat)) completedBeats = [...completedBeats, completedFriendBeat];
  const updated: VoyageState = {
    ...state,
    randomState: random.state(),
    day,
    turn: state.turn + 1,
    currentLocationId,
    locations,
    friends,
    energy,
    happiness,
    money,
    totalDistanceTravelled,
    greatestDistance: Math.max(state.greatestDistance, distance),
    interests: interest ? { ...state.interests, [interest]: (state.interests[interest] ?? 0) + 1 } : state.interests,
    completedBeats,
    pendingFollowUps,
    recentSceneIds: [...state.recentSceneIds, state.currentScene.templateId].slice(-VOYAGE_CONFIG.maximumRecentScenes),
    recentFamilies: [...state.recentFamilies, state.currentScene.family].slice(-VOYAGE_CONFIG.maximumRecentFamilies),
    recentChoiceSignatures: [...state.recentChoiceSignatures, choiceSignature(state.currentScene.choices)].slice(-VOYAGE_CONFIG.maximumChoiceSignatures),
    journal: appendJournal(state.journal, entry),
    lastOutcome: `${outcome}${destination ? ` The route from ${previousLocation.name} ends ${distance} km from home.` : ""}`,
  };
  return generateScene(updated);
}

export function createVoyage(seed: number): VoyageState {
  const normalized = normalizeSeed(seed);
  const home = homeLocation();
  const placeholder: VoyageScene = { id: "setup", templateId: "setup", family: "arrival", title: "The First Morning", openingPhrase: "The voyage begins.", text: "Mira opens a fresh travel journal.", choices: [] };
  const initial: VoyageState = {
    version: 1,
    seed: normalized,
    randomState: normalized,
    day: 1,
    turn: 0,
    currentLocationId: home.id,
    locations: { [home.id]: home },
    friends: {},
    energy: VOYAGE_CONFIG.startingEnergy,
    happiness: VOYAGE_CONFIG.startingHappiness,
    money: VOYAGE_CONFIG.startingMoney,
    totalDistanceTravelled: 0,
    greatestDistance: 0,
    interests: {},
    completedBeats: [],
    pendingFollowUps: [],
    recentSceneIds: [],
    recentFamilies: [],
    recentChoiceSignatures: [],
    journal: [{ id: "entry-0", day: 1, place: home.name, title: "A fresh page", text: "Mira sets out with curiosity, time, and no finish line to chase.", kind: "milestone" }],
    currentScene: placeholder,
    lastOutcome: "A new voyage begins. There is nowhere Mira has to be.",
  };
  return generateScene(initial);
}

export function choicePreview(choice: SceneChoice): string {
  return choice.detail;
}
