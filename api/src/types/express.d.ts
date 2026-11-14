import type { SessionContext } from "../modules/auth/session/types.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by attachSession(); undefined when there is no valid session. */
      eleanorSession?: SessionContext;
      /** Set by assignRequestIds(); also returned as X-Request-Id. */
      requestId: string;
      /** The client's X-Eleanor-Trace-Id, when it sent a valid one. */
      traceId?: string;
    }
  }
}

export {};
