import { apiRequest } from './http';
import type {
  CompanyConfigurationsData,
  CompanyConfigurationsResponse,
  CompanyProfile,
  CompanyProfilePayload,
  CompanyProfileResponse,
} from '../types/company';

export async function getCompanyProfile(): Promise<CompanyProfile> {
  const json = await apiRequest<CompanyProfileResponse>(
    '/companies/company/profile',
    { method: 'GET' },
    'Failed to load company profile. Please try again.',
  );

  return json.data;
}

export async function updateCompanyProfile(
  payload: CompanyProfilePayload,
): Promise<CompanyProfile> {
  const json = await apiRequest<CompanyProfileResponse>(
    '/companies/company/profile',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    'Failed to update company profile. Please try again.',
  );

  return json.data;
}

export async function getCompanyConfigurations(): Promise<CompanyConfigurationsData> {
  const json = await apiRequest<CompanyConfigurationsResponse>(
    '/companies/company/configurations',
    { method: 'GET' },
    'Failed to load company configurations. Please try again.',
  );

  return json.data;
}
