import { createHash } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { SessionService } from "../auth/session/service.js";
import type { SessionContext } from "../auth/session/types.js";
import type { PasskeyRepository } from "./repository.js";

const CEREMONY_TTL_MS = 5 * 60 * 1_000;

export class PasskeyService {
  constructor(
    private readonly repository: PasskeyRepository,
    private readonly sessions: SessionService,
    private readonly config: {
      readonly rpId: string;
      readonly rpName: string;
      readonly expectedOrigin: string;
      readonly enrollmentMaxOidcAgeSeconds: number;
      /** Must match the window enforced by requireRecentStepUp(). */
      readonly stepUpTtlSeconds: number;
    },
  ) {}

  async status(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    return {
      registered: passkeys.length > 0,
      count: passkeys.length,
      stepUpVerifiedAt:
        session.data.stepUpVerifiedAt ?? null,
    };
  }

  async registrationOptions(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    if (
      passkeys.length > 0 &&
      !this.hasRecentStepUp(session)
    ) {
      throw new PasskeyPolicyError(
        "Verify an existing passkey before adding another.",
        "STEP_UP_REQUIRED",
        428,
      );
    }

    if (
      passkeys.length === 0 &&
      !this.hasRecentOidcAuthentication(session)
    ) {
      throw new PasskeyPolicyError(
        "Sign in again before enrolling the first passkey.",
        "RECENT_LOGIN_REQUIRED",
        428,
      );
    }

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: this.stableUserId(user.id),
      userName: user.email ?? user.id,
      userDisplayName:
        user.name ?? user.email ?? "Eleanor user",
      attestationType: "none",
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: {
          type: "registration",
          challenge: options.challenge,
          createdAt: Date.now(),
        },
      },
    });

    return options;
  }

  async verifyRegistration(
    session: SessionContext,
    response: RegistrationResponseJSON,
  ) {
    const ceremony = this.requireCeremony(
      session,
      "registration",
    );

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.config.expectedOrigin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new PasskeyPolicyError(
        "Passkey registration could not be verified.",
        "PASSKEY_REGISTRATION_FAILED",
        400,
      );
    }

    const user = requireUser(session);
    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    await this.repository.insert({
      credentialId: credential.id,
      userId: user.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: null,
    });

    const verifiedAt = Date.now();

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: undefined,
        stepUpVerifiedAt: verifiedAt,
        stepUpCredentialId: credential.id,
      },
    });

    return {
      verified: true,
      stepUpVerifiedAt: verifiedAt,
    };
  }

  async authenticationOptions(session: SessionContext) {
    const user = requireUser(session);
    const passkeys = await this.repository.listForUser(user.id);

    if (passkeys.length === 0) {
      throw new PasskeyPolicyError(
        "Register a passkey before step-up verification.",
        "PASSKEY_REQUIRED",
        409,
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
    });

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: {
          type: "authentication",
          challenge: options.challenge,
          createdAt: Date.now(),
        },
      },
    });

    return options;
  }

  async verifyAuthentication(
    session: SessionContext,
    response: AuthenticationResponseJSON,
  ) {
    const ceremony = this.requireCeremony(
      session,
      "authentication",
    );

    const user = requireUser(session);

    const passkey = await this.repository.findForUser(
      user.id,
      response.id,
    );

    if (!passkey) {
      throw new PasskeyPolicyError(
        "The selected passkey is not registered to this account.",
        "PASSKEY_NOT_FOUND",
        400,
      );
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.config.expectedOrigin,
      expectedRPID: this.config.rpId,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: [...passkey.transports],
      },
    });

    if (!verification.verified) {
      throw new PasskeyPolicyError(
        "Passkey verification failed.",
        "PASSKEY_AUTHENTICATION_FAILED",
        401,
      );
    }

    await this.repository.updateCounter(
      user.id,
      passkey.credentialId,
      verification.authenticationInfo.newCounter,
    );

    const verifiedAt = Date.now();

    await this.sessions.save({
      ...session,
      data: {
        ...session.data,
        webauthn: undefined,
        stepUpVerifiedAt: verifiedAt,
        stepUpCredentialId: passkey.credentialId,
      },
    });

    return {
      verified: true,
      stepUpVerifiedAt: verifiedAt,
    };
  }

  private requireCeremony(
    session: SessionContext,
    type: "registration" | "authentication",
  ) {
    const ceremony = session.data.webauthn;

    if (
      !ceremony ||
      ceremony.type !== type ||
      Date.now() - ceremony.createdAt > CEREMONY_TTL_MS
    ) {
      throw new PasskeyPolicyError(
        "WebAuthn ceremony expired. Start again.",
        "WEBAUTHN_CEREMONY_EXPIRED",
        400,
      );
    }

    return ceremony;
  }

  private stableUserId(userId: string): Uint8Array<ArrayBuffer> {
    return createHash("sha256")
      .update(userId, "utf8")
      .digest();
  }

  private hasRecentOidcAuthentication(
    session: SessionContext,
  ): boolean {
    const authenticatedAt = session.data.authenticatedAt;

    return Boolean(
      authenticatedAt &&
      Date.now() - authenticatedAt <=
        this.config.enrollmentMaxOidcAgeSeconds * 1_000,
    );
  }

  private hasRecentStepUp(session: SessionContext): boolean {
    const verifiedAt = session.data.stepUpVerifiedAt;

    return Boolean(
      verifiedAt &&
      Date.now() - verifiedAt <= this.config.stepUpTtlSeconds * 1_000,
    );
  }
}

export class PasskeyPolicyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PasskeyPolicyError";
  }
}

function requireUser(session: SessionContext) {
  const user = session.data.user;

  if (!user) {
    throw new PasskeyPolicyError(
      "Authentication required.",
      "AUTHENTICATION_REQUIRED",
      401,
    );
  }

  return user;
}