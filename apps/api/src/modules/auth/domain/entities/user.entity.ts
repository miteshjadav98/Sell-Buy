import { UserStatus } from '@prisma/client';
import { BaseEntity } from '../../../../core/domain/base.entity';

export interface UserProps {
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  roles: string[];
}

/**
 * The User aggregate — where "may this person sign in?" is actually decided.
 *
 * These rules live here, not in the login use case, because they are true
 * regardless of how the attempt arrives (REST, GraphQL, an admin tool, a test).
 * The use case orchestrates; the entity decides.
 */
export class User extends BaseEntity<string> {
  private constructor(
    id: string,
    private props: UserProps,
  ) {
    super(id);
  }

  static hydrate(id: string, props: UserProps): User {
    return new User(id, props);
  }

  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string | null {
    return this.props.passwordHash;
  }
  get fullName(): string {
    return [this.props.firstName, this.props.lastName].filter(Boolean).join(' ');
  }
  get roles(): string[] {
    return [...this.props.roles];
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get failedLoginAttempts(): number {
    return this.props.failedLoginAttempts;
  }
  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }

  /** Locked out by repeated failures — distinct from suspended by an admin. */
  isLocked(): boolean {
    return this.props.lockedUntil !== null && this.props.lockedUntil > new Date();
  }

  isVerified(): boolean {
    return this.props.emailVerifiedAt !== null;
  }

  /** OAuth-only accounts have no password and must never match one. */
  hasPassword(): boolean {
    return this.props.passwordHash !== null;
  }

  /**
   * Every reason a login must be refused, in one place. Returning the reason
   * rather than a boolean lets the caller decide what to tell the user — and
   * deliberately, the login use case tells them almost nothing.
   */
  canAuthenticate(): { allowed: boolean; reason?: string } {
    if (this.isLocked()) {
      const minutes = Math.ceil((this.props.lockedUntil!.getTime() - Date.now()) / 60_000);
      return { allowed: false, reason: `Account locked. Try again in ${minutes} minute(s).` };
    }
    if (this.props.status === UserStatus.SUSPENDED) {
      return { allowed: false, reason: 'This account has been suspended.' };
    }
    if (this.props.status === UserStatus.DEACTIVATED) {
      return { allowed: false, reason: 'This account has been deactivated.' };
    }
    if (this.props.status === UserStatus.PENDING_VERIFICATION) {
      return { allowed: false, reason: 'Please verify your email before signing in.' };
    }
    return { allowed: true };
  }

  /**
   * Exponential lockout: 5 strikes, then 1, 2, 4, 8… minutes, capped at 30.
   *
   * A fixed lockout is trivially waited out by a script; doubling makes a
   * sustained attack economically pointless while barely inconveniencing a
   * human who mistyped their password twice.
   */
  registerFailedLogin(): { attempts: number; lockedUntil: Date | null } {
    const attempts = this.props.failedLoginAttempts + 1;
    this.props.failedLoginAttempts = attempts;

    if (attempts < 5) {
      this.props.lockedUntil = null;
      return { attempts, lockedUntil: null };
    }

    const minutes = Math.min(2 ** (attempts - 5), 30);
    const lockedUntil = new Date(Date.now() + minutes * 60_000);
    this.props.lockedUntil = lockedUntil;
    return { attempts, lockedUntil };
  }

  registerSuccessfulLogin(): void {
    this.props.failedLoginAttempts = 0;
    this.props.lockedUntil = null;
  }

  markEmailVerified(): void {
    this.props.emailVerifiedAt = new Date();
    if (this.props.status === UserStatus.PENDING_VERIFICATION) {
      this.props.status = UserStatus.ACTIVE;
    }
  }
}
