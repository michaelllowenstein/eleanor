import type { RedisClient } from "../core/redis.js";

interface FakeMulti {
  del(key: string): FakeMulti;
  set(key: string, value: string, options?: { EX?: number }): FakeMulti;
  exec(): Promise<unknown[]>;
}

interface Entry {
  value: string;
  expiresAt: number | null;
}

/**
 * In-memory stand-in for the subset of node-redis used by the API
 * (sessions + rate limiting). Test-only; not exported from the build.
 */
export class FakeRedis {
  readonly store = new Map<string, Entry>();
  failing = false;

  async get(key: string): Promise<string | null> {
    this.guard();
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<"OK"> {
    this.guard();
    this.store.set(key, {
      value,
      expiresAt: options?.EX ? Date.now() + options.EX * 1_000 : null,
    });
    return "OK";
  }

  async del(key: string): Promise<number> {
    this.guard();
    return this.store.delete(key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    this.guard();
    const current = Number(this.read(key)?.value ?? "0") + 1;
    const existing = this.store.get(key);
    this.store.set(key, { value: String(current), expiresAt: existing?.expiresAt ?? null });
    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.guard();
    const entry = this.read(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1_000;
    return 1;
  }

  async ping(): Promise<string> {
    this.guard();
    return "PONG";
  }

  async quit(): Promise<void> {}

  multi(): FakeMulti {
    const ops: Array<() => Promise<unknown>> = [];
    const chain: FakeMulti = {
      del: (key: string) => {
        ops.push(() => this.del(key));
        return chain;
      },
      set: (key: string, value: string, options?: { EX?: number }) => {
        ops.push(() => this.set(key, value, options));
        return chain;
      },
      exec: async () => {
        const results: unknown[] = [];
        for (const op of ops) results.push(await op());
        return results;
      },
    };
    return chain;
  }

  asClient(): RedisClient {
    return this as unknown as RedisClient;
  }

  private read(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private guard(): void {
    if (this.failing) throw new Error("FakeRedis: simulated outage");
  }
}
