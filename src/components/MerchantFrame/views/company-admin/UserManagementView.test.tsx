import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagementView } from './UserManagementView';
import {
  createUser,
  getCompanyUsers,
  getCurrentMerchantId,
  getUserHrSummary,
  setUserActiveStatus,
  triggerUserPasswordReset,
  updateUser,
} from '../../../../api/users';
import type { PlatformUser } from '../../../../types/user';

vi.mock('../../../../api/users', () => ({
  getCompanyUsers: vi.fn(),
  getCurrentMerchantId: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserActiveStatus: vi.fn(),
  triggerUserPasswordReset: vi.fn(),
  getUserHrSummary: vi.fn(),
}));

const DOWNTOWN = { id: 5, name: 'Acme Downtown', companyId: 1 };
const AIRPORT = { id: 9, name: 'Acme Airport', companyId: 1 };

const MOCK_USERS: PlatformUser[] = [
  {
    id: 1,
    username: 'jdoe',
    email: 'john@acme.com',
    role: 'merchant_admin',
    scope: 'merchant_web',
    isActive: true,
    merchantId: 5,
    merchant: DOWNTOWN,
  },
  {
    id: 2,
    username: 'asmith',
    email: 'anna@acme.com',
    role: 'merchant_user',
    scope: 'merchant_android',
    isActive: false,
    merchantId: 5,
    merchant: DOWNTOWN,
  },
  {
    id: 3,
    username: 'kbranch',
    email: 'kate@acme.com',
    role: 'merchant_user',
    scope: 'merchant_web',
    isActive: true,
    merchantId: 9,
    merchant: AIRPORT,
  },
];

function renderView() {
  return render(
    <MemoryRouter>
      <UserManagementView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getCompanyUsers).mockResolvedValue(MOCK_USERS);
  vi.mocked(getCurrentMerchantId).mockReturnValue(5);
  vi.mocked(createUser).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(updateUser).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(setUserActiveStatus).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(triggerUserPasswordReset).mockResolvedValue({
    statusCode: 200,
    message: 'sent',
  });
  vi.mocked(getUserHrSummary).mockResolvedValue({
    user: MOCK_USERS[0],
    collaborators: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserManagementView', () => {
  it('renders the loaded users', async () => {
    renderView();
    expect(await screen.findByText('jdoe')).toBeInTheDocument();
    expect(screen.getByText('john@acme.com')).toBeInTheDocument();
    expect(screen.getByText('asmith')).toBeInTheDocument();
  });

  it('lists the users of every branch of the company with their branch', async () => {
    renderView();
    expect(await screen.findByText('kbranch')).toBeInTheDocument();
    expect(screen.getAllByText('Acme Downtown')).toHaveLength(2);
    expect(screen.getByText('Acme Airport')).toBeInTheDocument();
  });

  it('lets the admin manage only the users of its own branch', async () => {
    renderView();
    await screen.findByText('kbranch');

    expect(screen.getByRole('button', { name: 'Edit jdoe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit kbranch' })).not.toBeInTheDocument();
    expect(screen.getByText('Other branch')).toBeInTheDocument();

    // A row of another branch does not open the HR summary either.
    await userEvent.click(screen.getByText('kbranch'));
    expect(getUserHrSummary).not.toHaveBeenCalled();
  });

  it('shows the zero-match message when filters exclude everyone', async () => {
    renderView();
    await screen.findByText('jdoe');
    await userEvent.type(
      screen.getByPlaceholderText(/search by username or email/i),
      'zzzzz-nobody',
    );
    expect(
      await screen.findByText('No users match your criteria'),
    ).toBeInTheDocument();
  });

  it('opens the create modal from the floating action button', async () => {
    renderView();
    await screen.findByText('jdoe');
    // The FAB carries the exact accessible name "Add user".
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('Add User')).toBeInTheDocument();
    expect(screen.getByLabelText(/security role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access scope/i)).toBeInTheDocument();
  });
});
