export type ResourceBand = "comfortable" | "low" | "empty";
export type SceneFamily =
  | "arrival"
  | "everyday"
  | "food"
  | "rest"
  | "work"
  | "friendship"
  | "arts"
  | "astronomy"
  | "nature"
  | "festival";

export interface Location {
  id: string;
  name: string;
  geography: "coast" | "mountain" | "river" | "plain";
  character: "village" | "town" | "city";
  x: number;
  y: number;
  season: "spring" | "summer" | "autumn" | "winter";
  weather: "clear" | "cloudy" | "rainy" | "breezy";
  localCulture: string;
  amenities: string[];
  connections: string[];
  visited: boolean;
}

export interface Friend {
  id: string;
  name: string;
  personality: string;
  interest: string;
  locationId: string;
  relationship: number;
  metOnDay: number;
}

export interface JournalEntry {
  id: string;
  day: number;
  place: string;
  title: string;
  text: string;
  kind: "place" | "friend" | "discovery" | "choice" | "milestone";
}

export interface ChoiceEffects {
  days: number;
  money: number;
  energy: number;
  happiness: number;
  distanceTravelled?: number;
}

export interface SceneChoice {
  id: string;
  action: "travel" | "eat" | "rest" | "enjoy" | "work" | "connect" | "recover";
  title: string;
  detail: string;
  effects: ChoiceEffects;
  available: boolean;
  unavailableReason?: string;
  destinationId?: string;
  journalText: string;
  interest?: string;
  friendId?: string;
}

export interface VoyageScene {
  id: string;
  templateId: string;
  family: SceneFamily;
  title: string;
  text: string;
  openingPhrase: string;
  choices: SceneChoice[];
}

export interface VoyageState {
  version: 1;
  seed: number;
  randomState: number;
  day: number;
  turn: number;
  currentLocationId: string;
  locations: Record<string, Location>;
  friends: Record<string, Friend>;
  energy: number;
  happiness: number;
  money: number;
  totalDistanceTravelled: number;
  greatestDistance: number;
  interests: Record<string, number>;
  completedBeats: string[];
  pendingFollowUps: string[];
  recentSceneIds: string[];
  recentFamilies: SceneFamily[];
  recentChoiceSignatures: string[];
  journal: JournalEntry[];
  currentScene: VoyageScene;
  lastOutcome: string;
}

export interface VoyageSave {
  version: 1;
  savedAt: number;
  state: VoyageState;
}

export interface SceneTemplate {
  id: string;
  family: SceneFamily;
  title: string;
  openings: string[];
  clearText: string;
  wetText: string;
  activity: string;
  interest: string;
}
