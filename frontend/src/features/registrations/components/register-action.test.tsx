import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RegistrationOptionsView } from '@/types/api';
import { useRegistrationOptions } from '../hooks/use-registrations';
import { RegisterAction } from './register-action';

vi.mock('../hooks/use-registrations', () => ({ useRegistrationOptions: vi.fn() }));

const options = (over: Partial<RegistrationOptionsView>): RegistrationOptionsView => ({
  eventId: 'EVT-224',
  canRegister: false,
  block: null,
  reason: null,
  opensAt: '2030-03-03T00:00:00.000Z',
  closesAt: '2030-03-10T00:00:00.000Z',
  alreadyRegistered: false,
  registeredCount: 0,
  capacity: 50,
  ...over,
});

const showWith = (view: RegistrationOptionsView) => {
  vi.mocked(useRegistrationOptions).mockReturnValue({
    data: view,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useRegistrationOptions>);
  render(<RegisterAction eventId="EVT-224" onRegister={vi.fn()} />);
};

describe('US-46 the Register option', () => {
  // TC-S3-105 · US-46 AC-7 · fails if Register stays usable when registration is not open or the event is full, or no reason is shown
  // Code: RegisterAction -> blockedMessage
  it.each([
    ['not yet open', { block: 'NOT_YET_OPEN' as const }, /Registration opens/],
    ['closed', { block: 'CLOSED' as const }, /Registration closed/],
    ['full', { block: 'FULL' as const, registeredCount: 50 }, /full — all 50 places are taken/],
  ])('US-46 AC-7: %s — Register is disabled, with the reason beside it', (_label, over, reason) => {
    showWith(options(over));

    const button = screen.getByRole('button', { name: 'Register' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(reason);
  });

  // TC-S3-105 · US-46 AC-7 · fails if Register is disabled while registration is open
  // Code: RegisterAction (canRegister)
  it('US-46 AC-7: open with places left — Register is enabled, with no reason', () => {
    showWith(options({ canRegister: true }));

    expect(screen.getByRole('button', { name: 'Register' })).toBeEnabled();
    expect(screen.queryByText(/Registration (opens|closed)|full/)).toBeNull();
  });
});
