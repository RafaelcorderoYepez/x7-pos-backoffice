import { vi } from 'vitest';

/**
 * Respuesta HTTP real para mockear `fetch` en tests. Usar en lugar de objetos parciales
 * (`{ ok, json }`): el cliente de api/http lee el cuerpo con `text()` y mira `status`.
 */
export function jsonResponse(body: unknown, status = 200): Response {
  const noBody = status === 204 || status === 304;
  return new Response(noBody ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type RouteHandler = unknown | ((init: RequestInit | undefined, url: string) => Response);

/**
 * `fetch` falso que enruta por "METHOD /ruta" (sin el prefijo /api ni la query). Una entrada
 * sin método equivale a GET. El valor es el cuerpo JSON a devolver o una función que construye
 * la Response. Lo no registrado responde 404, para que una ruta mal escrita falle a la vista.
 *
 *   const fetchMock = fakeBackend({ '/products': { data: [...] }, 'POST /products': () => jsonResponse({}, 201) });
 */
export function fakeBackend(routes: Record<string, RouteHandler>) {
  const table = Object.entries(routes).map(([key, handler]) => {
    const [method, path] = key.includes(' ') ? key.split(' ') : ['GET', key];
    return { method, path, handler };
  });
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^\/api/, '').split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();
    const route = table.find((r) => r.method === method && r.path === path);
    if (!route) return jsonResponse({ message: `Unexpected ${method} ${path}` }, 404);
    return typeof route.handler === 'function'
      ? (route.handler as (i: RequestInit | undefined, u: string) => Response)(init, url)
      : jsonResponse(route.handler);
  });
}

/** Rutas (sin /api ni query) que recibió un `fakeBackend`, con su método. */
export function calledRoutes(fetchMock: ReturnType<typeof fakeBackend>): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const path = String(input).replace(/^\/api/, '').split('?')[0];
    return `${(init?.method ?? 'GET').toUpperCase()} ${path}`;
  });
}
