import { describe, expect, test } from "bun:test";
import { StockfishEngine } from "./engine";

class FakeWorker {
  messages: string[] = [];
  terminated = false;
  private messageListeners: Array<(event: MessageEvent<string>) => void> = [];
  private errorListeners: Array<(event: ErrorEvent) => void> = [];

  postMessage(message: string): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<string>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.push(listener as (event: MessageEvent<string>) => void);
    else this.errorListeners.push(listener as (event: ErrorEvent) => void);
  }

  emit(line: string): void {
    for (const listener of this.messageListeners) listener({ data: line } as MessageEvent<string>);
  }

  fail(message: string): void {
    for (const listener of this.errorListeners) listener({ message } as ErrorEvent);
  }
}

async function initializedEngine(): Promise<{ engine: StockfishEngine; worker: FakeWorker }> {
  const worker = new FakeWorker();
  const engine = new StockfishEngine(() => worker);
  const initialization = engine.initialize();
  worker.emit("option name Skill Level type spin default 20 min 0 max 20");
  worker.emit("option name UCI_LimitStrength type check default false");
  worker.emit("option name UCI_Elo type spin default 3190 min 1320 max 3190");
  worker.emit("option name MultiPV type spin default 1 min 1 max 256");
  worker.emit("uciok");
  worker.emit("readyok");
  await initialization;
  return { engine, worker };
}

async function waitForMessage(worker: FakeWorker, prefix: string, count = 1): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (worker.messages.filter((message) => message.startsWith(prefix)).length >= count) return;
    await Bun.sleep(0);
  }
  throw new Error(`Worker never received ${prefix}`);
}

describe("Stockfish UCI adapter", () => {
  test("handshakes and applies the centralized difficulty options", async () => {
    const { engine, worker } = await initializedEngine();
    const search = engine.search({ startingFen: "start", moves: ["e2e4"], positionFen: "position-1", difficulty: "medium", generation: 4 });
    await waitForMessage(worker, "go ");
    expect(worker.messages).toContain("setoption name Skill Level value 5");
    expect(worker.messages).toContain("setoption name UCI_LimitStrength value true");
    expect(worker.messages).toContain("setoption name UCI_Elo value 1600");
    expect(worker.messages).toContain("position fen start moves e2e4");
    expect(worker.messages).toContain("go movetime 650");
    worker.emit("info depth 8 multipv 1 score cp 20 pv e7e5 g1f3");
    worker.emit("bestmove e7e5");
    await expect(search).resolves.toEqual({ uci: "e7e5", generation: 4, positionFen: "position-1" });
    engine.destroy();
  });

  test("cancels and drains a stale search before accepting another", async () => {
    const { engine, worker } = await initializedEngine();
    const stale = engine.search({ startingFen: "start", moves: [], positionFen: "old", difficulty: "hard", generation: 1 });
    await waitForMessage(worker, "go ");
    engine.cancel();
    await expect(stale).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.messages.at(-1)).toBe("stop");

    const next = engine.search({ startingFen: "start", moves: [], positionFen: "new", difficulty: "hard", generation: 2 });
    await Bun.sleep(0);
    expect(worker.messages.filter((message) => message.startsWith("go "))).toHaveLength(1);
    worker.emit("bestmove e2e4");
    expect(worker.messages.at(-1)).toBe("isready");
    worker.emit("readyok");
    await waitForMessage(worker, "go ", 2);
    expect(worker.messages.filter((message) => message.startsWith("go "))).toHaveLength(2);
    worker.emit("bestmove d2d4");
    await expect(next).resolves.toEqual({ uci: "d2d4", generation: 2, positionFen: "new" });
    engine.destroy();
  });

  test("terminates the worker and rejects an active search on exit", async () => {
    const { engine, worker } = await initializedEngine();
    const search = engine.search({ startingFen: "start", moves: [], positionFen: "active", difficulty: "hard", generation: 3 });
    await waitForMessage(worker, "go ");
    engine.destroy();
    await expect(search).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.messages).toContain("quit");
    expect(worker.terminated).toBe(true);
  });

  test("surfaces worker initialization failures and permits a separate retry instance", async () => {
    const failedWorker = new FakeWorker();
    const failed = new StockfishEngine(() => failedWorker);
    const initialization = failed.initialize();
    failedWorker.fail("wasm unavailable");
    await expect(initialization).rejects.toThrow("wasm unavailable");
    expect(failedWorker.terminated).toBe(true);

    const { engine } = await initializedEngine();
    await expect(engine.initialize()).resolves.toBeUndefined();
    engine.destroy();
  });
});
