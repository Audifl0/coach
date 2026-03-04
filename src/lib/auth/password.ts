import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 8;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export class PasswordPolicyError extends Error {
  constructor(message = `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export function enforcePasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError();
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const digest = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt.toString('hex')}:${digest.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, digestHex] = storedHash.split(':');

  if (!saltHex || !digestHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const storedDigest = Buffer.from(digestHex, 'hex');
  const computedDigest = scryptSync(password, salt, storedDigest.length);

  if (storedDigest.length !== computedDigest.length) {
    return false;
  }

  return timingSafeEqual(storedDigest, computedDigest);
}

