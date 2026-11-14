import { Router } from "express";

import type { Logger } from "../../core/logger.js";
import { userRef } from "../../core/context.js";
import { requireAuthentication, requireCsrf } from "../../middleware/auth.js";
import type { AuditTrail } from "../audit/service.js";
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
  readonly audit: AuditTrail;
  /** Lower-cased verified emails allowed to sign in; empty = anyone. */
  readonly allowedEmails: readonly string[];
}): Router {
  const { sessions, oidc, users, publicOrigin, audit, allowedEmails } = deps;
  const log = deps.logger.child({ category: "auth" });
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

    log.info("auth.login_started", { reauth });
    response.redirect(flow.authorizationUrl.href);
  });

  router.get("/callback", async (request, response) => {
    const session = request.eleanorSession;
    const transaction = session?.data.oidc;

    if (!session || !transaction) {
      log.warn("auth.callback_without_transaction", { hadSession: Boolean(session) });
      response.status(400).send("Authentication transaction was not found. Start sign-in again.");
      return;
    }

    try {
      const completed = await oidc.complete(
        new URL(request.originalUrl, publicOrigin),
        transaction,
      );

      if (allowedEmails.length > 0) {
        const email = completed.user.email?.toLowerCase();
        if (!email || !completed.emailVerified || !allowedEmails.includes(email)) {
          log.warn("auth.not_allowed", {
            userRef: userRef(completed.user.id),
            hasEmail: Boolean(email),
            emailVerified: completed.emailVerified,
          });
          await sessions.destroy(session, response);
          response.status(403).send("This account isn't allowed to use this Eleanor instance.");
          return;
        }
      }

      // A re-authentication must belong to the same account.
      const previousUser = session.data.user;
      if (previousUser && previousUser.id !== completed.user.id) {
        log.warn("auth.account_mismatch");
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

      log.info("auth.login", { userRef: userRef(completed.user.id), reauth: Boolean(previousUser) });
      void audit.record({
        userId: completed.user.id,
        kind: "auth.login",
        source: "api",
        summary: previousUser ? "Signed in again to confirm identity." : "Signed in.",
        data: { reauth: Boolean(previousUser) },
      });

      response.redirect(new URL(transaction.returnTo, publicOrigin).href);
    } catch (error) {
      log.warn("auth.callback_failed", { error });
      response.status(401).send("Authentication could not be completed.");
    }
  });

  router.post(
    "/logout",
    requireAuthentication(),
    requireCsrf(),
    async (request, response) => {
      const session = request.eleanorSession!;
      const userId = session.data.user!.id;
      const logoutUrl = oidc.logoutUrl(session.data.idTokenHint) ?? publicOrigin;

      await sessions.destroy(session, response);

      log.info("auth.logout");
      void audit.record({ userId, kind: "auth.logout", source: "api", summary: "Signed out." });

      response.json({ logoutUrl });
    },
  );

  return router;
}
