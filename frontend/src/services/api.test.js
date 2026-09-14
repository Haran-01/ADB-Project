import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('unwraps collection responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'one' }] }), { status: 200 })),
    );
    await expect(api.disruptions()).resolves.toEqual([{ id: 'one' }]);
  });

  it('preserves server errors for the UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Conflict' }), { status: 409 })),
    );
    await expect(api.createDisruption({})).rejects.toMatchObject({
      name: 'Error',
      message: 'Conflict',
      status: 409,
    });
    try {
      await api.createDisruption({});
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
    }
  });
});
