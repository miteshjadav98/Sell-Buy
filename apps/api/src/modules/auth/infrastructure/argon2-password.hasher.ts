import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { IPasswordHasher } from '../domain/ports/auth.ports';

/**
 * Argon2id — the current recommendation from OWASP and the winner of the
 * Password Hashing Competition.
 *
 * Why not bcrypt: bcrypt is memory-light, so a GPU or ASIC farm parallelises it
 * cheaply. Argon2id is deliberately *memory*-hard (19 MiB per hash here), which
 * is expensive to replicate across thousands of cores. That asymmetry is the
 * whole defence for a leaked password table.
 *
 * The parameters below are the OWASP baseline: m=19456 KiB, t=2, p=1.
 */
@Injectable()
export class Argon2PasswordHasher implements IPasswordHasher {
  private readonly logger = new Logger(Argon2PasswordHasher.name);

  private static readonly OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // KiB
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, Argon2PasswordHasher.OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch (error) {
      // A malformed hash must read as "wrong password", never as a crash —
      // an exception here would be a 500 that distinguishes real accounts
      // from the dummy hash used for timing equalisation.
      this.logger.warn(`Password verification failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Detects hashes made with weaker parameters, so they can be transparently
   * upgraded the next time the user successfully signs in — no mass reset, no
   * user-visible migration.
   */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, Argon2PasswordHasher.OPTIONS);
    } catch {
      return true; // unparseable means legacy: rehash it
    }
  }
}
