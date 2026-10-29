import type { AuthUser } from '../types/auth';

const ACCESS_TOKEN_KEY = 'x7_access_token';
const REFRESH_TOKEN_KEY = 'x7_refresh_token';
const USER_KEY = 'x7_user';
const REMEMBERED_EMAIL_KEY = 'x7_remembered_email';
const REMEMBER_STATION_KEY = 'x7_remember_station';

function getStorage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

export function saveAuthSession(
  accessToken: string,
  refreshToken: string,
  user: AuthUser,
  remember: boolean,
): void {
  clearAuthSession();
  const storage = getStorage(remember);
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveRememberStation(email: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    localStorage.setItem(REMEMBER_STATION_KEY, 'true');
    return;
  }

  localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  localStorage.removeItem(REMEMBER_STATION_KEY);
}

export function getRememberedLogin(): {
  email: string;
  rememberStation: boolean;
} {
  const rememberStation =
    localStorage.getItem(REMEMBER_STATION_KEY) === 'true';
  const email = localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '';

  return {
    email: rememberStation ? email : '',
    rememberStation,
  };
}

export function clearAuthSession(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_KEY);
  }
}

/** Ends the session and sends the user back to the login page (hard navigation). */
export function redirectToLogin(): void {
  clearAuthSession();
  window.location.href = '/login';
}

export function getAccessToken(): string | null {
  return (
    localStorage.getItem(ACCESS_TOKEN_KEY) ??
    sessionStorage.getItem(ACCESS_TOKEN_KEY)
  );
}

export function getStoredUser(): AuthUser | null {
  const raw =
    localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null && getStoredUser() !== null;
}
