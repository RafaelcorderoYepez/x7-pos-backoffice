import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError } from '../lib/api-error';
import { apiRequest, postJson, SAAS_SESSION_EXPIRED, saasRequest } from './http';

describe('http client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts 201 responses with an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        text: async () => '',
      }),
    );

    await expect(postJson('/onboarding/business-profile', {})).resolves.toBeUndefined();
  });

  it('sends JSON bodies with a JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/things', { method: 'POST', body: JSON.stringify({ a: 1 }) }, 'failed');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('lets the browser set the multipart boundary for FormData bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/upload', { method: 'POST', body: new FormData() }, 'failed');

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  describe('saasRequest', () => {
    afterEach(() => {
      localStorage.clear();
    });

    it('sends the platform admin token, not the merchant one, against API_BASE', async () => {
      localStorage.setItem('x7_saas_admin_token', 'saas-token');
      localStorage.setItem('x7_access_token', 'merchant-token');
      const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(saasRequest('/features', { method: 'GET' }, 'failed')).resolves.toEqual({ data: [] });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/features');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer saas-token');
    });

    it('clears the SaaS session on a 401 and throws SESSION_EXPIRED', async () => {
      localStorage.setItem('x7_saas_admin_token', 'expired');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));

      const err = await saasRequest('/features', { method: 'GET' }, 'failed').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe(SAAS_SESSION_EXPIRED);
      expect(localStorage.getItem('x7_saas_admin_token')).toBeNull();
    });

    it('surfaces the backend message and status on other errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('{"message":"Plan in use"}', { status: 409 })),
      );

      await expect(saasRequest('/subscription-plan/1', { method: 'DELETE' }, 'failed')).rejects.toMatchObject({
        message: 'Plan in use',
        status: 409,
      });
    });
  });
});
