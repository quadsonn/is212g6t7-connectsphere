import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegistrationOptionsView, RegistrationView } from '@/types/api';
import { registrationsApi } from '../api/registrations.api';
import { RegisterAction } from './register-action';
import { RegisterForm } from './register-form';

/**
 * UI tests for US-33 (Register for an event and provide required information):
 * the Register button and the registration form, rendered with React Testing
 * Library, API mocked. The server's rules are proven by
 * test/registrations-register.e2e-spec.ts; the browser journey by
 * e2e/us32-us35-registrations.spec.ts.
 */

vi.mock('../api/registrations.api', () => ({ registrationsApi: { options: vi.fn(), register: vi.fn() } }));

const api = vi.mocked(registrationsApi);

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const options = (overrides: Partial<RegistrationOptionsView>) =>
  ({
    eventId: 'EVT-101',
    canRegister: false,
    alreadyRegistered: false,
    block: null,
    reason: null,
    opensAt: '2030-09-01T01:00:00.000Z',
    closesAt: '2030-09-20T01:00:00.000Z',
    registeredCount: 40,
    capacity: 100,
    ...overrides,
  }) as RegistrationOptionsView;

const badRequest = (status: number, message: string | string[]) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: { statusCode: status, message },
  } as never);

const renderAction = () => {
  const onRegister = vi.fn();
  render(
    <QueryClientProvider client={client()}>
      <RegisterAction eventId="EVT-101" onRegister={onRegister} />
    </QueryClientProvider>,
  );
  return onRegister;
};

const renderForm = () => {
  const onRegistered = vi.fn();
  render(
    <QueryClientProvider client={client()}>
      <RegisterForm eventId="EVT-101" onRegistered={onRegistered} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
  return onRegistered;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('US-33 AC-1, AC-6, AC-7: the Register option, and why it is unavailable', () => {
  // TC-S2-144 · US-33 AC-1 · fails if an event open for registration offered no working Register button
  // Code: RegisterAction asks GET /registrations/events/:eventId/options; canRegister enables Register.
  it('offers Register when the server says registration is open', async () => {
    api.options.mockResolvedValue(options({ canRegister: true }));
    const user = userEvent.setup();
    const onRegister = renderAction();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(onRegister).toHaveBeenCalled();
  });

  // TC-S2-144 · US-33 AC-6 · fails if, outside the window, Register was offered or the open and close times weren't shown
  // Code: block NOT_YET_OPEN disables Register and shows "Registration opens ... and closes ...".
  it('shows the open and close times instead of Register before registration opens', async () => {
    api.options.mockResolvedValue(options({ block: 'NOT_YET_OPEN' }));
    renderAction();

    expect(await screen.findByText(/^Registration opens .+ and closes .+\.$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  // TC-S2-144 · US-33 AC-7 · fails if a full event did not say so
  // Code: block FULL shows "This event is full — all N places are taken."
  it('says the event is full', async () => {
    api.options.mockResolvedValue(options({ block: 'FULL' }));
    renderAction();

    expect(await screen.findByText('This event is full — all 100 places are taken.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });
});

describe('US-33 AC-2, AC-3, AC-7: the registration form', () => {
  // TC-S2-144 · US-33 AC-2 · fails if an invalid phone number was not flagged at its field
  // Code: fieldErrors() puts the 400 "phone ..." message under Phone number and marks it aria-invalid.
  it('flags an invalid phone number at its field, and registers nothing', async () => {
    api.register.mockRejectedValue(badRequest(400, ['phone must be a valid phone number with its country code']));
    const user = userEvent.setup();
    const onRegistered = renderForm();

    await user.type(screen.getByLabelText(/Phone number/), '12');
    await user.click(screen.getByRole('button', { name: 'Confirm registration' }));

    await waitFor(() => expect(screen.getByLabelText(/Phone number/)).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText(/valid phone number/)).toBeInTheDocument();
    expect(onRegistered).not.toHaveBeenCalled();
  });

  // TC-S2-144 · US-33 AC-2 · fails if "Other" could be chosen without describing the need
  // Code: choosing Other makes "Describe your request" required; the form is not sent until it is filled.
  it('requires a description when the accessibility need is Other', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Phone number/), '+65 9123 4567');
    await user.selectOptions(screen.getByLabelText(/Accessibility needs/), 'OTHER');
    await user.click(screen.getByRole('button', { name: 'Confirm registration' }));

    expect(screen.getByText('Please describe your accessibility request.')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });

  // TC-S2-144 · US-33 AC-3 · fails if a valid registration was not sent, or the page was not told it succeeded
  // Code: POST /registrations with the phone (and only filled optional fields); onSuccess calls onRegistered.
  it('sends the registration and reports it as done', async () => {
    api.register.mockResolvedValue({ id: 'REG-001', status: 'REGISTERED' } as RegistrationView);
    const user = userEvent.setup();
    const onRegistered = renderForm();

    await user.type(screen.getByLabelText(/Phone number/), '+65 9123 4567');
    await user.click(screen.getByRole('button', { name: 'Confirm registration' }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    expect(api.register.mock.calls[0][0]).toEqual({ eventId: 'EVT-101', phone: '+65 9123 4567' });
  });

  // TC-S2-144 · US-33 AC-7 · fails if a registration refused as full gave no "full" message
  // Code: a 409 shows the server's message above the buttons.
  it('shows the "full" refusal when the last place went first', async () => {
    api.register.mockRejectedValue(badRequest(409, 'This event is full.'));
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/Phone number/), '+65 9123 4567');
    await user.click(screen.getByRole('button', { name: 'Confirm registration' }));

    expect(await screen.findByText('This event is full.')).toBeInTheDocument();
  });
});
