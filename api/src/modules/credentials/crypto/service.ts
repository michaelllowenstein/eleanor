import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class CredentialCryptoService {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");

    if (this.key.length !== 32) {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.",
      );
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.key,
      iv,
    );

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]).toString("base64");
  }

  decrypt(envelope: string): string {
    const payload = Buffer.from(envelope, "base64");

    if (payload[0] !== VERSION) {
      throw new Error(
        `Unsupported credential encryption version: ${payload[0]}.`,
      );
    }

    const iv = payload.subarray(1, 1 + IV_LENGTH);
    const tag = payload.subarray(
      1 + IV_LENGTH,
      1 + IV_LENGTH + TAG_LENGTH,
    );
    const ciphertext = payload.subarray(
      1 + IV_LENGTH + TAG_LENGTH,
    );

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      iv,
    );

    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  }
}
