import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from './auth';

const TOKEN_STORAGE_KEY = 'milktrack.auth.tokens';

describe('saved authentication tokens', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the signed-in user from the saved token format', async () => {
    const payload = btoa(
      JSON.stringify({
        sub: 'user-123',
        email: 'user@example.com',
        name: 'MilkTrack User',
      }),
    );
    storage.set(
      TOKEN_STORAGE_KEY,
      JSON.stringify({
        idToken: `header.${payload}.signature`,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
      }),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      sub: 'user-123',
      email: 'user@example.com',
      name: 'MilkTrack User',
    });
  });

  it('clears malformed saved tokens and treats the user as signed out', async () => {
    storage.set(TOKEN_STORAGE_KEY, JSON.stringify({ id_token: 'old-format' }));

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(storage.has(TOKEN_STORAGE_KEY)).toBe(false);
  });
});
