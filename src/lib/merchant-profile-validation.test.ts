import { describe, expect, it } from 'vitest';
import {
  hasMerchantProfileErrors,
  validateMerchantProfile,
} from './merchant-profile-validation';

describe('merchant-profile-validation', () => {
  const valid = {
    name: 'Downtown Bistro',
    email: 'contact@bistro.com',
    phone: '',
    address: '456 Oak Ave',
    city: 'Brooklyn',
    state: 'NY',
    country: 'USA',
  };

  it('accepts valid merchant profile without phone', () => {
    const errors = validateMerchantProfile(valid);
    expect(hasMerchantProfileErrors(errors)).toBe(false);
  });

  it('requires email', () => {
    const errors = validateMerchantProfile({ ...valid, email: '' });
    expect(errors.email).toBeDefined();
  });

  it('validates optional phone when provided', () => {
    const errors = validateMerchantProfile({ ...valid, phone: '!!!' });
    expect(errors.phone).toBeDefined();
  });

  it('accepts international phone format', () => {
    const errors = validateMerchantProfile({
      ...valid,
      phone: '+1 (555) 000-0000',
    });
    expect(errors.phone).toBeUndefined();
  });

  it('accepts omitted phone', () => {
    const withoutPhone: Partial<typeof valid> = { ...valid };
    delete withoutPhone.phone;
    const errors = validateMerchantProfile(withoutPhone);
    expect(hasMerchantProfileErrors(errors)).toBe(false);
  });
});
