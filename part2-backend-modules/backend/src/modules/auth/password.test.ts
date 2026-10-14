import { describe, expect, it } from 'vitest';
import { hashPassword, normalizeEmail, verifyPassword } from './password';

describe('passwords', () => {
  it('verifies the right password and rejects wrong ones', () => {
    const h = hashPassword('Lensio@2026');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('Lensio@2026', h)).toBe(true);
    expect(verifyPassword('lensio@2026', h)).toBe(false);
    expect(verifyPassword('', h)).toBe(false);
  });
  it('salts every hash', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'));
  });
  it('rejects accounts with no password set', () => {
    expect(verifyPassword('anything', null)).toBe(false);
    expect(verifyPassword('anything', 'garbage')).toBe(false);
  });
  it('normalises emails', () => {
    expect(normalizeEmail('  Suhas.Test@Gmail.COM ')).toBe('suhas.test@gmail.com');
  });
});
