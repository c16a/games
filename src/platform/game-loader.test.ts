import { describe, expect, test } from "bun:test";
import type { GameModule, KaplayModule } from "./game";
import {
  GameLoadingCoordinator,
  LatestRouteGuard,
  allowsIntentPrefetch,
  type GameDefinition,
} from "./game-loader";

const moduleValue: GameModule = {
  mount: () => ({ destroy() {} }),
};
const kaplayValue = {} as KaplayModule;

function definition(
  id: "canvas" | "cards",
  engine: "kaplay" | "dom",
  load: () => Promise<GameModule>,
): GameDefinition<"canvas" | "cards"> {
  return {
    id,
    engine,
    load,
    name: id,
    description: id,
    badge: id,
    icon: id,
    accent: "#000",
  };
}

describe("game loading coordinator", () => {
  test("reuses in-flight module and engine promises", async () => {
    let moduleLoads = 0;
    let engineLoads = 0;
    const coordinator = new GameLoadingCoordinator([
      definition("canvas", "kaplay", async () => {
        moduleLoads += 1;
        return moduleValue;
      }),
    ], async () => {
      engineLoads += 1;
      return kaplayValue;
    });

    const first = coordinator.prepare("canvas");
    const second = coordinator.prepare("canvas");
    expect(first.moduleReady).toBe(second.moduleReady);
    expect(first.kaplayReady).toBe(second.kaplayReady);
    await Promise.all([first.moduleReady, first.kaplayReady]);
    expect(moduleLoads).toBe(1);
    expect(engineLoads).toBe(1);
  });

  test("starts a KAPLAY game's module and engine together", async () => {
    const started: string[] = [];
    let resolveModule!: (module: GameModule) => void;
    const modulePromise = new Promise<GameModule>((resolve) => { resolveModule = resolve; });
    const coordinator = new GameLoadingCoordinator([
      definition("canvas", "kaplay", () => {
        started.push("module");
        return modulePromise;
      }),
    ], async () => {
      started.push("kaplay");
      return kaplayValue;
    });

    const prepared = coordinator.prepare("canvas");
    expect(started).toEqual(["module", "kaplay"]);
    resolveModule(moduleValue);
    await Promise.all([prepared.moduleReady, prepared.kaplayReady]);
  });

  test("evicts rejected promises so a retry can succeed", async () => {
    let attempts = 0;
    const coordinator = new GameLoadingCoordinator([
      definition("cards", "dom", async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
        return moduleValue;
      }),
    ], async () => kaplayValue);

    await expect(coordinator.prepare("cards").moduleReady).rejects.toThrow("temporary failure");
    await expect(coordinator.prepare("cards").moduleReady).resolves.toBe(moduleValue);
    expect(attempts).toBe(2);
  });

  test("loads KAPLAY only for games that use it", async () => {
    let engineLoads = 0;
    const coordinator = new GameLoadingCoordinator([
      definition("cards", "dom", async () => moduleValue),
      definition("canvas", "kaplay", async () => moduleValue),
    ], async () => {
      engineLoads += 1;
      return kaplayValue;
    });

    const cards = coordinator.prepare("cards");
    expect(cards.kaplayReady).toBeUndefined();
    await cards.moduleReady;
    expect(engineLoads).toBe(0);

    await coordinator.prepare("canvas").kaplayReady;
    expect(engineLoads).toBe(1);
  });

  test("prefetches intent without ignoring reduced-data preferences", async () => {
    let loads = 0;
    const coordinator = new GameLoadingCoordinator([
      definition("canvas", "kaplay", async () => {
        loads += 1;
        return moduleValue;
      }),
    ], async () => kaplayValue);

    expect(coordinator.prefetch("canvas", "hover", { saveData: true })).toBe(false);
    expect(coordinator.prefetch("canvas", "focus", { effectiveType: "slow-2g" })).toBe(false);
    expect(loads).toBe(0);
    expect(coordinator.prefetch("canvas", "pointerdown", { saveData: true })).toBe(true);
    await coordinator.prepare("canvas").moduleReady;
    expect(loads).toBe(1);
  });
});

describe("intent and route policies", () => {
  test("allows hover and focus normally but not on save-data or 2G", () => {
    expect(allowsIntentPrefetch("hover")).toBe(true);
    expect(allowsIntentPrefetch("focus", { effectiveType: "4g" })).toBe(true);
    expect(allowsIntentPrefetch("hover", { saveData: true })).toBe(false);
    expect(allowsIntentPrefetch("focus", { effectiveType: "2g" })).toBe(false);
    expect(allowsIntentPrefetch("pointerdown", { saveData: true, effectiveType: "2g" })).toBe(true);
  });

  test("marks a superseded route request as stale", () => {
    const guard = new LatestRouteGuard();
    const carrom = guard.begin();
    expect(carrom.isCurrent()).toBe(true);
    const home = guard.begin();
    expect(carrom.isCurrent()).toBe(false);
    expect(home.isCurrent()).toBe(true);
  });
});
