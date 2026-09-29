export class ApiError extends Error {
  readonly status: number;
  /** Código máquina del cuerpo del error (`code`), cuando el backend lo manda. */
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function getApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  return (await getApiErrorDetails(response, fallback)).message;
}

/**
 * Mensaje y código del cuerpo de error en UNA sola lectura (el cuerpo de un Response sólo se
 * puede consumir una vez). El código distingue errores con el mismo status: un 409 de aforo
 * que admite override del encargado no es un 409 de mesa ocupada.
 */
export async function getApiErrorDetails(
  response: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { message: fallback };
  }
  const code =
    typeof data === 'object' && data !== null && typeof (data as { code?: unknown }).code === 'string'
      ? (data as { code: string }).code
      : undefined;
  return { message: messageFromBody(data) ?? fallback, code };
}

function messageFromBody(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const body = data as { message?: unknown; errors?: unknown };

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors.filter((item): item is string => typeof item === 'string').join(', ');
  }

  if (Array.isArray(body.message)) return body.message.join(', ');
  if (typeof body.message === 'string') return body.message;
  return null;
}

export const INVALID_CREDENTIALS_MESSAGE =
  'Incorrect email or password. Please try again.';
