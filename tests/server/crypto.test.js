import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '../../server/services/crypto.js';

const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

describe('crypto module', () => {
  beforeEach(() => {
    process.env.CREDENTIALS_KEY = TEST_KEY;
  });

  it('encrypt/decrypt roundtrip returns the original plaintext', () => {
    const plaintext = 'super secret wp app password';
    const encoded = encrypt(plaintext);
    expect(encoded).not.toBe(plaintext);
    expect(decrypt(encoded)).toBe(plaintext);
  });

  it('encrypting the same plaintext twice yields different ciphertext (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });

  it('decrypting tampered ciphertext throws', () => {
    const encoded = encrypt('hello');
    const tampered = encoded.slice(0, -4) + 'AAAA';
    expect(() => decrypt(tampered)).toThrow();
  });

  it('throws if CREDENTIALS_KEY is missing', () => {
    delete process.env.CREDENTIALS_KEY;
    expect(() => encrypt('x')).toThrow(/CREDENTIALS_KEY/);
  });
});
