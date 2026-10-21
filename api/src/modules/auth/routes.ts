import { Router } from "express";

import type { Logger } from "../../core/logger.js";
import { requireAuthentication, requireCsrf } from "../../middleware/auth.js";
import type { UserRepository } from "../users/repository.js";
import type { OidcClient } from "./oidc/service.js";
import { SessionService } from "./session/service.js";

export const DEFAULT_RETURN_TO = "/assistant";

export function createAuthRouter(deps: {
  readonly sessions: SessionService;
  readonly oidc: OidcClient;
  readonly users: UserRepository;
  readonly publicOrigin: string;
  readonly logger: Logger;
}): Router {
  const { sessions, oidc, users, publicOrigin, logger } = deps;
  const router = Router();

  router.get("/session", async (request, response) => {
    const session = await sessions.ensure(request, response);

    response.set("Cache-Control", "no-store").json({
      authenticated: Boolean(session.data.user),
      user: session.data.user ?? null,
      csrfToken: session.data.csrfToken,
      authenticatedAt: session.data.authenticatedAt ?? null,
    });
  });

  /**
   * GET /api/auth/login?returnTo=/path[&reauth=1]
   *
   * reauth=1 forces a fresh identity-provider login even when the session is
   * already authenticated. Without it, a signed-in user whose OIDC login is
   * older than PASSKEY_ENROLLMENT_MAX_OIDC_AGE_SECONDS could never enrol a
   * first passkey (the old behaviour redirected them straight back).
   */
  router.get("/login", async (request, response) => {
    const session = await sessions.ensure(request, response);
    const reauth = request.query.reauth === "1";
    const returnTo =
      typeof request.query.returnTo === "string"
        ? request.query.returnTo
        : DEFAULT_RETURN_TO;

    if (session.data.user && !reauth) {
      response.redirect(new URL(DEFAULT_RETURN_TO, publicOrigin).href);
      return;
    }

    const flow = await oidc.begin(returnTo, { forceReauthentication: reauth });

    await sessions.save({
      ...session,
      data: { ...session.data, oidc: flow.transaction },
    });

    response.redirect(flow.authorizationUrl.href);
  });

  router.get("/callback", async (request, response) => {
    const session = request.eleanorSession;
    const transaction = session?.data.oidc;

    if (!session || !transaction) {
      response.status(400).send("Authentication transaction was not found. Start sign-in again.");
      return;
    }

    try {
      const completed = await oidc.complete(
        new URL(request.originalUrl, publicOrigin),
        transaction,
      );

      // A re-authentication must belong to the same account.
      const previousUser = session.data.user;
      if (previousUser && previousUser.id !== completed.user.id) {
        await sessions.destroy(session, response);
        response.status(409).send("Signed in as a different account. Sign in again.");
        return;
      }

      await users.recordLogin(completed.user.id);

      await sessions.rotate(session, response, {
        csrfToken: sessions.randomToken(),
        createdAt: Date.now(),
        authenticatedAt: Date.now(),
        user: completed.user,
        idTokenHint: completed.idTokenHint,
      });

      logger.info("auth.login", { requestId: request.requestId });
      response.redirect(new URL(transaction.returnTo, publicOrigin).href);
    } catch (error) {
      logger.warn("auth.callback_failed", { requestId: request.requestId, error });
      response.status(401).send("Authentication could not be completed.");
    }
  });

  router.post(
    "/logout",
    requireAuthentication(),
    requireCsrf(),
    async (request, response) => {
      const session = request.eleanorSession!;
      const logoutUrl = oidc.logoutUrl(session.data.idTokenHint) ?? publicOrigin;

      await sessions.destroy(session, response);

      response.json({ logoutUrl });
    },
  );

  return router;
}
