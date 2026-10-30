import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalUsersDirectoryView } from './GlobalUsersDirectoryView';
import { saasService } from '../../../services/saasService';
import type { PlatformUser } from '../../../types/user';
import type { CompanyRegistryItem } from '../../../types/company-registry';

vi.mock('../../../services/saasService', () => ({
  saasService: {
    listPlatformUsers: vi.fn(),
    listCompanies: vi.fn(),
    setPlatformUserActive: vi.fn(),
  },
}));

const USERS: PlatformUser[] = [
  {
    id: 1,
    username: 'ana',
    email: 'ana@acme.com',
    role: 'merchant_admin',
    scope: 'merchant_web',
    isActive: true,
    merchantId: 10,
    merchant: { id: 10, name: 'Acme Downtown', companyId: 100 },
  },
  {
    id: 2,
    username: 'beto',
    email: 'beto@globex.com',
    role: 'merchant_user',
    scope: 'merchant_android',
    isActive: false,
    merchantId: 20,
    merchant: { id: 20, name: 'Globex Airport', companyId: 200 },
  },
];

const COMPANIES = [
  { id: 100, name: 'Acme Corp' },
  { id: 200, name: 'Globex' },
] as CompanyRegistryItem[];

describe('GlobalUsersDirectoryView', () => {
  beforeEach(() => {
    vi.mocked(saasService.listPlatformUsers).mockResolvedValue(USERS);
    vi.mocked(saasService.listCompanies).mockResolvedValue(COMPANIES);
    vi.mocked(saasService.setPlatformUserActive).mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists the users of every company with their company and merchant', async () => {
    render(<GlobalUsersDirectoryView />);

    await waitFor(() => {
      expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
    });
    const table = within(screen.getByRole('table'));
    expect(table.getByText('beto@globex.com')).toBeInTheDocument();
    expect(table.getByText('Acme Corp')).toBeInTheDocument();
    expect(table.getByText('Globex Airport')).toBeInTheDocument();
    expect(screen.getByText('2 users')).toBeInTheDocument();
  });

  it('filters by company', async () => {
    render(<GlobalUsersDirectoryView />);
    await waitFor(() => {
      expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
    });

    await userEvent.selectOptions(screen.getByLabelText('Company'), '200');

    expect(screen.queryByText('ana@acme.com')).not.toBeInTheDocument();
    expect(screen.getByText('beto@globex.com')).toBeInTheDocument();
  });

  it('deactivates a user after confirming and reloads the directory', async () => {
    render(<GlobalUsersDirectoryView />);
    await waitFor(() => {
      expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate ana@acme.com' }));
    await userEvent.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(saasService.setPlatformUserActive).toHaveBeenCalledWith(1, false);
    });
    expect(saasService.listPlatformUsers).toHaveBeenCalledTimes(2);
  });

  it('offers a retry when the users cannot be loaded', async () => {
    vi.mocked(saasService.listPlatformUsers).mockRejectedValueOnce(new Error('boom'));
    render(<GlobalUsersDirectoryView />);

    await waitFor(() => {
      expect(screen.getByText('The users could not be loaded.')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('ana@acme.com')).toBeInTheDocument();
    });
  });
});
