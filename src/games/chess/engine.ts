import { DIFFICULTY_PROFILES, stableChoiceIndex } from "./difficulty";
import type { ChessDifficulty } from "./logic";

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";

interface WorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<string>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
}

export interface EngineMove {
  uci: string;
  generation: number;
  positionFen: string;
}

interface SearchTask {
  generation: number;
  positionFen: string;
  difficulty: ChessDifficulty;
  candidates: Map<number, string>;
  resolve: (move: EngineMove) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function abortError(message = "Stockfish search cancelled"): Error {
  return new DOMException(message, "AbortError");
}

export class StockfishEngine {
  private worker?: WorkerLike;
  private current?: SearchTask;
  private ready = false;
  private destroyed = false;
  private initPromise?: Promise<void>;
  private initResolve?: () => void;
  private initReject?: (error: Error) => void;
  private initTimeout?: ReturnType<typeof setTimeout>;
  private drainPromise: Promise<void> = Promise.resolve();
  private drainResolve?: () => void;
  private draining = false;
  private cancellationGeneration = 0;
  private readonly supportedOptions = new Set<string>();

  constructor(private readonly createWorker: () => WorkerLike = () => new Worker(ENGINE_URL)) {}

  initialize(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.destroyed) return Promise.reject(new Error("Stockfish engine was closed"));
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;
      try {
        this.worker = this.createWorker();
        this.worker.addEventListener("message", (event) => this.handleLine(String(event.data)));
        this.worker.addEventListener("error", (event) => this.fail(new Error(event.message || "Stockfish worker failed")));
        this.worker.postMessage("setoption name CanOutputEngineDownloadProgress");
        this.worker.postMessage("uci");
        this.initTimeout = globalThis.setTimeout(() => this.fail(new Error("Stockfish took too long to load")), 15_000);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error("Stockfish could not start"));
      }
    });
    return this.initPromise;
  }

  async search(options: {
    startingFen: string;
    moves: readonly string[];
    positionFen: string;
    difficulty: ChessDifficulty;
    generation: number;
  }): Promise<EngineMove> {
    const cancellationGeneration = this.cancellationGeneration;
    await this.initialize();
    await this.drainPromise;
    if (cancellationGeneration !== this.cancellationGeneration) throw abortError();
    if (this.destroyed) throw new Error("Stockfish engine was closed");
    if (this.current) throw new Error("Stockfish searches must be serialized");

    const profile = DIFFICULTY_PROFILES[options.difficulty];
    this.setOption("Skill Level", profile.skillLevel);
    this.setOption("UCI_LimitStrength", true);
    this.setOption("UCI_Elo", profile.uciElo);
    this.setOption("MultiPV", profile.multiPv);
    const position = options.moves.length > 0
      ? `position fen ${options.startingFen} moves ${options.moves.join(" ")}`
      : `position fen ${options.startingFen}`;
    this.worker!.postMessage(position);

    return new Promise<EngineMove>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        if (!this.current || this.current.generation !== options.generation) return;
        this.current.reject(new Error("Stockfish search timed out"));
        this.current = undefined;
        this.beginDrain();
      }, profile.moveTimeMs + 3_000);
      this.current = {
        generation: options.generation,
        positionFen: options.positionFen,
        difficulty: options.difficulty,
        candidates: new Map(),
        resolve,
        reject,
        timeout,
      };
      this.worker!.postMessage(`go movetime ${profile.moveTimeMs}`);
    });
  }

  cancel(): void {
    this.cancellationGeneration += 1;
    if (!this.current) return;
    globalThis.clearTimeout(this.current.timeout);
    this.current.reject(abortError());
    this.current = undefined;
    this.beginDrain();
  }

  async newGame(): Promise<void> {
    this.cancel();
    await this.drainPromise;
    this.worker?.postMessage("ucinewgame");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancellationGeneration += 1;
    if (this.initTimeout !== undefined) globalThis.clearTimeout(this.initTimeout);
    if (this.current) {
      globalThis.clearTimeout(this.current.timeout);
      this.current.reject(abortError("Stockfish engine closed"));
      this.current = undefined;
    }
    this.worker?.postMessage("quit");
    this.worker?.terminate();
    this.worker = undefined;
    this.drainResolve?.();
    this.initReject?.(new Error("Stockfish engine closed"));
  }

  private setOption(name: string, value: string | number | boolean): void {
    if (this.supportedOptions.has(name.toLowerCase())) {
      this.worker!.postMessage(`setoption name ${name} value ${String(value)}`);
    }
  }

  private beginDrain(): void {
    if (!this.worker || this.draining) return;
    this.draining = true;
    this.drainPromise = new Promise<void>((resolve) => {
      this.drainResolve = resolve;
    });
    this.worker.postMessage("stop");
  }

  private finishDrain(): void {
    this.worker?.postMessage("isready");
  }

  private handleLine(rawLine: string): void {
    for (const line of rawLine.split(/\r?\n/)) {
      if (line.startsWith("option name ")) {
        const name = line.slice("option name ".length).split(" type ")[0];
        if (name) this.supportedOptions.add(name.toLowerCase());
      }
      if (line === "uciok") {
        this.worker?.postMessage("isready");
      } else if (line === "readyok") {
        if (!this.ready) {
          this.ready = true;
          if (this.initTimeout !== undefined) globalThis.clearTimeout(this.initTimeout);
          this.initResolve?.();
          this.initResolve = undefined;
          this.initReject = undefined;
        }
        if (this.draining) {
          this.draining = false;
          this.drainResolve?.();
          this.drainResolve = undefined;
        }
      } else if (line.startsWith("info ") && this.current) {
        const match = line.match(/\bmultipv (\d+).*\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (match?.[1] && match[2]) this.current.candidates.set(Number(match[1]), match[2]);
      } else if (line.startsWith("bestmove ")) {
        if (!this.current) {
          if (this.draining) this.finishDrain();
          continue;
        }
        const task = this.current;
        this.current = undefined;
        globalThis.clearTimeout(task.timeout);
        const best = line.split(/\s+/)[1];
        const candidates = [...task.candidates.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, move]) => move);
        if (best && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best) && !candidates.includes(best)) candidates.unshift(best);
        const choice = task.difficulty === "easy"
          ? stableChoiceIndex(task.positionFen, candidates.length)
          : 0;
        const uci = candidates[choice];
        if (!uci) task.reject(new Error("Stockfish returned no legal move"));
        else task.resolve({ uci, generation: task.generation, positionFen: task.positionFen });
      }
    }
  }

  private fail(error: Error): void {
    if (this.initTimeout !== undefined) globalThis.clearTimeout(this.initTimeout);
    this.current?.reject(error);
    this.current = undefined;
    this.initReject?.(error);
    this.initReject = undefined;
    this.initPromise = undefined;
    this.ready = false;
    this.worker?.terminate();
    this.worker = undefined;
  }
}
