import { randomBytes } from "node:crypto";
import { parse, serialize } from "cookie";
import type { Request, Response } from "express";

import type { RedisClient } from "../../../core/redis.js";
import type { EleanorSession, SessionContext } from "./types.js";

export class SessionService {
  private readonly cookieName: string;

  constructor(
    private readonly redis: RedisClient,
    private readonly config: {
      readonly production: boolean;
      readonly ttlSeconds: number;
    },
  ) {
    this.cookieName = config.production
      ? "__Host-eleanor-session"
      : "eleanor-session";
  }

  async get(request: Request): Promise<SessionContext | null> {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    const sessionId = parse(cookieHeader)[this.cookieName];

    if (!sessionId) {
      return null;
    }

    const raw = await this.redis.get(this.key(sessionId));

    if (!raw) {
      return null;
    }

    try {
      return {
        id: sessionId,
        data: JSON.parse(raw) as EleanorSession,
      };
    } catch {
      await this.redis.del(this.key(sessionId));
      return null;
    }
  }

  async ensure(
    request: Request,
    response: Response,
  ): Promise<SessionContext> {
    const existing = await this.get(request);

    if (existing) {
      return existing;
    }

    const session: SessionContext = {
      id: this.randomToken(),
      data: this.freshData(),
    };

    await this.save(session);
    this.setCookie(response, session.id);

    return session;
  }

  async save(session: SessionContext): Promise<void> {
    await this.redis.set(
      this.key(session.id),
      JSON.stringify(session.data),
      { EX: this.config.ttlSeconds },
    );
  }

  async rotate(
    current: SessionContext,
    response: Response,
    data: EleanorSession,
  ): Promise<SessionContext> {
    const next: SessionContext = {
      id: this.randomToken(),
      data,
    };

    await this.redis
      .multi()
      .del(this.key(current.id))
      .set(
        this.key(next.id),
        JSON.stringify(next.data),
        { EX: this.config.ttlSeconds },
      )
      .exec();

    this.setCookie(response, next.id);
    return next;
  }

  async destroy(
    session: SessionContext,
    response: Response,
  ): Promise<void> {
    await this.redis.del(this.key(session.id));

    response.append(
      "Set-Cookie",
      serialize(this.cookieName, "", {
        path: "/",
        httpOnly: true,
        secure: this.config.production,
        sameSite: "lax",
        maxAge: 0,
      }),
    );
  }

  randomToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private freshData(): EleanorSession {
    return {
      csrfToken: this.randomToken(),
      createdAt: Date.now(),
    };
  }

  private setCookie(response: Response, sessionId: string): void {
    response.append(
      "Set-Cookie",
      serialize(this.cookieName, sessionId, {
        path: "/",
        httpOnly: true,
        secure: this.config.production,
        sameSite: "lax",
        maxAge: this.config.ttlSeconds,
      }),
    );
  }

  private key(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
