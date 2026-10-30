import { apiRequest } from './http';
import { getStoredUser } from '../lib/auth-storage';
import { ApiError } from '../lib/api-error';
import type {
  CreateUserPayload,
  MerchantUser,
  MessageResponse,
  PlatformUser,
  UpdateUserPayload,
  UserHrSummary,
  UserHrSummaryResponse,
  UserMutationResponse,
  UsersListResponse,
} from '../types/user';

/** Resolves the logged-in administrator's merchant id (used to anchor new users). */
export function getCurrentMerchantId(): number | null {
  return getStoredUser()?.merchant.id ?? null;
}

export async function getMerchantUsers(): Promise<MerchantUser[]> {
  const merchantId = getCurrentMerchantId();
  if (!merchantId) {
    throw new ApiError('Unable to resolve merchant context. Please sign in again.', 400);
  }

  const json = await apiRequest<UsersListResponse>(
    `/users/merchant/${merchantId}`,
    { method: 'GET' },
    'Failed to load users. Please try again.',
  );

  return json.data ?? [];
}

/**
 * Users of every branch of the logged-in user's company (GET /users/company), each with
 * its merchant. The backend takes the company from the session.
 */
export async function getCompanyUsers(): Promise<PlatformUser[]> {
  const json = await apiRequest<{ data?: PlatformUser[] }>(
    '/users/company',
    { method: 'GET' },
    'Failed to load users. Please try again.',
  );

  return json.data ?? [];
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<MerchantUser> {
  const json = await apiRequest<UserMutationResponse>(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to create user. Please try again.',
  );

  return json.data;
}

export async function updateUser(
  id: number,
  payload: UpdateUserPayload,
): Promise<MerchantUser> {
  const json = await apiRequest<UserMutationResponse>(
    `/users/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    'Failed to update user. Please try again.',
  );

  return json.data;
}

export async function setUserActiveStatus(
  id: number,
  isActive: boolean,
): Promise<MerchantUser> {
  const json = await apiRequest<UserMutationResponse>(
    `/users/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    },
    'Failed to update user status. Please try again.',
  );

  return json.data;
}

export async function triggerUserPasswordReset(
  id: number,
): Promise<MessageResponse> {
  return apiRequest<MessageResponse>(
    `/users/${id}/reset-password`,
    { method: 'POST' },
    'Failed to trigger password reset. Please try again.',
  );
}

export async function getUserHrSummary(id: number): Promise<UserHrSummary> {
  const json = await apiRequest<UserHrSummaryResponse>(
    `/users/${id}/hr-summary`,
    { method: 'GET' },
    'Failed to load HR summary. Please try again.',
  );

  return json.data;
}
