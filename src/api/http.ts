import { ApiError, getApiErrorDetails, getApiErrorMessage } from '../lib/api-error';
import { getAccessToken, redirectToLogin } from '../lib/auth-storage';
import { clearSaasToken, getSaasToken } from '../lib/saas-auth-storage';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const REQUEST_TIMEOUT_MS = 30_000;

// Cuerpo vacío (201/204 sin contenido) → undefined; si no, JSON.
async function parseJsonBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = await getApiErrorMessage(response, fallbackMessage);
    throw new ApiError(message, response.status);
  }

  return parseJsonBody<T>(response);
}

export function getJson<T>(
  path: string,
  fallbackMessage = 'Request failed. Please try again.',
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    fallbackMessage,
  );
}

export function postJson<T>(
  path: string,
  body: unknown,
  fallbackMessage = 'Request failed. Please try again.',
): Promise<T> {
  return requestJson<T>(
    path,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    fallbackMessage,
  );
}

/** Cabeceras de una petición autenticada (Bearer del usuario en sesión). */
export function authHeaders(includeJson = false): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Petición autenticada contra la API del backoffice.
 *
 * - Añade el token y `Content-Type: application/json` cuando hay cuerpo.
 * - 401 → cierra la sesión y lleva al login (sesión caducada o token inválido).
 * - Otros errores → `ApiError` con el mensaje y el `code` que mande el backend.
 *
 * No usar para login/registro: ahí un 401 significa credenciales incorrectas.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      // Solo cuerpos JSON (string): con FormData el navegador pone el boundary multipart.
      ...authHeaders(typeof init.body === 'string'),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError('Unauthorized', 401);
  }

  if (!response.ok) {
    const { message, code } = await getApiErrorDetails(response, fallbackMessage);
    throw new ApiError(message, response.status, code);
  }

  return parseJsonBody<T>(response);
}

/** Mensaje del error que lanza `saasRequest` cuando caduca la sesión del panel SaaS. */
export const SAAS_SESSION_EXPIRED = 'SESSION_EXPIRED';

/**
 * Petición autenticada del panel SaaS (token de administrador de plataforma, no el del merchant).
 *
 * - 401 → borra el token SaaS y lanza `ApiError(SAAS_SESSION_EXPIRED, 401)`; cada vista decide
 *   si muestra un aviso o vuelve al login del panel.
 * - Otros errores → `ApiError` con el mensaje y el `code` que mande el backend.
 */
export async function saasRequest<T>(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<T> {
  const token = getSaasToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401) {
    clearSaasToken();
    throw new ApiError(SAAS_SESSION_EXPIRED, 401);
  }

  if (!response.ok) {
    const { message, code } = await getApiErrorDetails(response, fallbackMessage);
    throw new ApiError(message, response.status, code);
  }

  return parseJsonBody<T>(response);
}

/** Lista que el backend devuelve tal cual o envuelta en `{ data }` (algunos módulos usan `{ items }`). */
export type MaybeEnvelopedList<T> = T[] | { data?: T[]; items?: T[] };

/** Registro que el backend devuelve unas veces tal cual y otras envuelto en `{ data }`. */
export type MaybeEnvelopedItem<T> = T | { data?: T };

export function unwrapList<T>(json: MaybeEnvelopedList<T> | null | undefined): T[] {
  if (Array.isArray(json)) return json;
  return json?.data ?? json?.items ?? [];
}

export function unwrapItem<T>(json: MaybeEnvelopedItem<T>): T {
  return (json as { data?: T }).data || (json as T);
}

/**
 * GET que prueba varias rutas en orden y pasa a la siguiente si una falla (salvo 401, que ya
 * redirigió al login). Solo para recursos que el backend expone en dos módulos a la vez
 * (p. ej. `v1/raw-material-stock/items` y el antiguo `items`); no usarlo para adivinar rutas.
 */
export async function getWithFallback<T>(paths: string[], fallbackMessage: string): Promise<T> {
  let lastError: unknown = new ApiError(fallbackMessage, 0);
  for (const path of paths) {
    try {
      return await apiRequest<T>(path, { method: 'GET' }, fallbackMessage);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
