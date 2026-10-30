import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import * as authApi from '../api/auth';
import * as forgotPassword from '../lib/forgot-password';
import {
  FORGOT_PASSWORD_SEND_FEEDBACK_MESSAGE,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
} from '../lib/forgot-password';

vi.mock('../api/auth', () => ({
  requestPasswordReset: vi.fn(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('binds the email input to id="email"', () => {
    renderPage();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute(
      'id',
      'email',
    );
  });

  it('blocks submission and shows validation for invalid email', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'invalid-email');
    await user.click(screen.getByTestId('forgot-password-submit'));

    expect(authApi.requestPasswordReset).not.toHaveBeenCalled();
    expect(
      screen.getByText('Enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('shows send feedback and enforces a 30 second resend cooldown', async () => {
    const user = userEvent.setup();
    let cooldownSeconds = 0;

    vi.spyOn(forgotPassword, 'getResendCooldownSeconds').mockImplementation(
      () => cooldownSeconds,
    );
    vi.spyOn(forgotPassword, 'ensureMinimumLoadingDuration').mockImplementation(
      async (startedAt) => {
        const elapsed = Date.now() - startedAt;
        if (elapsed < 1_000) {
          await new Promise((resolve) => setTimeout(resolve, 1_000 - elapsed));
        }
      },
    );
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue({
      message: 'Recovery link sent to email.',
    });

    renderPage();

    await user.type(
      screen.getByLabelText(/email address/i),
      'chef@x7kitchen.com',
    );
    await user.click(screen.getByTestId('forgot-password-submit'));

    expect(screen.getByTestId('forgot-password-submit')).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByTestId('forgot-password-submit')).toBeEnabled();
    });

    expect(authApi.requestPasswordReset).toHaveBeenCalledWith(
      'chef@x7kitchen.com',
    );
    expect(
      screen.getByText(FORGOT_PASSWORD_SUCCESS_MESSAGE),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('forgot-password-send-feedback'),
    ).toHaveTextContent(FORGOT_PASSWORD_SEND_FEEDBACK_MESSAGE);
    expect(screen.getByText('Resend Reset Link')).toBeInTheDocument();

    cooldownSeconds = 30;
    // The page polls the cooldown every 1000 ms, the same as waitFor's default timeout:
    // on a slow CI runner the tick lost the race. Leave room for a couple of ticks.
    await waitFor(
      () => {
        expect(screen.getByTestId('forgot-password-submit')).toBeDisabled();
        expect(screen.getByText('Resend in 30s')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await user.click(screen.getByTestId('forgot-password-submit'));
    expect(authApi.requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('shows rate-limit warning on HTTP 429', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../lib/api-error');
    vi.spyOn(forgotPassword, 'ensureMinimumLoadingDuration').mockResolvedValue();
    vi.mocked(authApi.requestPasswordReset).mockRejectedValue(
      new ApiError('Too Many Requests', 429),
    );

    renderPage();

    await user.type(
      screen.getByLabelText(/email address/i),
      'chef@x7kitchen.com',
    );
    await user.click(screen.getByTestId('forgot-password-submit'));

    expect(
      screen.getByText(
        'Too many requests. Please wait a few minutes before trying again.',
      ),
    ).toBeInTheDocument();
  });

  it('links back to login', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
