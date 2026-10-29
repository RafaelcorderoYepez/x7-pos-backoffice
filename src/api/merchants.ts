import { apiRequest } from './http';
import type {
  CompanyMerchant,
  CompanyMerchantsMeta,
  CompanyMerchantsResponse,
  MerchantAdminSummary,
  MerchantAdminSummaryResponse,
  MerchantFormPayload,
  MerchantMutationResponse,
} from '../types/merchant';

export async function getCompanyMerchants(): Promise<{
  merchants: CompanyMerchant[];
  meta: CompanyMerchantsMeta;
}> {
  const json = await apiRequest<CompanyMerchantsResponse>(
    '/merchants/company/branches',
    { method: 'GET' },
    'Failed to load merchants. Please try again.',
  );

  return {
    merchants: json.data ?? [],
    meta: json.meta,
  };
}

export async function createCompanyMerchant(
  payload: MerchantFormPayload,
): Promise<CompanyMerchant> {
  const json = await apiRequest<MerchantMutationResponse>(
    '/merchants/company/branches',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    'Failed to create merchant. Please try again.',
  );

  return json.data;
}

export async function updateCompanyMerchant(
  id: number,
  payload: MerchantFormPayload,
): Promise<CompanyMerchant> {
  const json = await apiRequest<MerchantMutationResponse>(
    `/merchants/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    'Failed to update merchant. Please try again.',
  );

  return json.data;
}

export async function deactivateCompanyMerchant(
  id: number,
): Promise<CompanyMerchant> {
  const json = await apiRequest<MerchantMutationResponse>(
    `/merchants/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify({ status: 'inactive' }),
    },
    'Failed to deactivate merchant. Please try again.',
  );

  return json.data;
}

export async function getMerchantAdminSummary(
  id: number,
): Promise<MerchantAdminSummary> {
  const json = await apiRequest<MerchantAdminSummaryResponse>(
    `/merchants/${id}/admin-summary`,
    { method: 'GET' },
    'Failed to load merchant summary. Please try again.',
  );

  return json.data;
}
