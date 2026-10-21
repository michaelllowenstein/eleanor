import type { SessionContext } from "../modules/auth/session/types.js";

declare global {
  namespace Express {
    interface Request {
      eleanorSession?: SessionContext;
      requestId?: string;
    }
  }
}

export {};