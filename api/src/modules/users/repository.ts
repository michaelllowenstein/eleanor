import type { Pool } from "pg";

export interface UserRepository {
  /** Creates the user on first sign-in and records the login time. */
  recordLogin(userId: string): Promise<void>;
}

export function createUserRepository(database: Pool): UserRepository {
  return {
    async recordLogin(userId) {
      await database.query(
        `
          INSERT INTO users (id, last_login_at)
          VALUES ($1, NOW())
          ON CONFLICT (id) DO UPDATE SET last_login_at = NOW()
        `,
        [userId],
      );
    },
  };
}
