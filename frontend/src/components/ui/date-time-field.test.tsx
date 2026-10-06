import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FULL_DAY_TIME_SLOTS } from '@/lib/date-time';
import { DateTimeField } from './date-time-field';

/** A parent holding the value, as the planning and block forms do. */
function Harness({ initial = '', spy }: { initial?: string; spy: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimeField
        id="f"
        label="Start"
        value={value}
        onChange={(v) => {
          setValue(v);
          spy(v);
        }}
        slots={FULL_DAY_TIME_SLOTS}
      />
      <button type="button" onClick={() => setValue('')}>
        reset
      </button>
      <output>{value || 'empty'}</output>
    </>
  );
}

describe('DateTimeField', () => {
  it('shows a prefilled value as its date and time', () => {
    render(<Harness initial="2030-10-01T09:30" spy={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Start date: Tuesday,? 1 October/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Start time' })).toHaveValue('09:30');
  });

  it('reports nothing until both halves are chosen, but keeps the half that was picked', async () => {
    const spy = vi.fn();
    render(<Harness initial="2030-10-01T09:30" spy={spy} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Start time' }), '');
    expect(spy).toHaveBeenLastCalledWith('');
    expect(screen.getByText('empty')).toBeInTheDocument();
    // The date is still shown although the form now holds ''.
    expect(screen.getByRole('button', { name: /Start date: Tuesday,? 1 October/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Start time' }), '23:00');
    expect(spy).toHaveBeenLastCalledWith('2030-10-01T23:00');
  });

  it('follows a reset from the form', async () => {
    render(<Harness initial="2030-10-01T09:30" spy={vi.fn()} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByRole('button', { name: /Start date: Select a date/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Start time' })).toHaveValue('');
  });

  it('offers the whole day when given the full-day slots', () => {
    render(<Harness spy={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: 'Start time' });
    expect(select).toHaveTextContent('12:00 AM');
    expect(select).toHaveTextContent('11:30 PM');
  });
});
