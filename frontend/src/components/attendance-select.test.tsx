import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AttendanceSelect } from './attendance-select';

const options = () =>
  within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent);

describe('AttendanceSelect: expected attendance as a range', () => {
  it('Given no value, Then it asks for a range first, then lists every range', () => {
    render(<AttendanceSelect id="a" value="" onChange={vi.fn()} />);

    expect(options()).toEqual([
      'Select a range',
      'Fewer than 10',
      '10 – 49',
      '50 – 99',
      '100 – 199',
      '200 – 499',
      '500 or more',
    ]);
  });

  it('Given a stored range, Then that range is selected', () => {
    render(<AttendanceSelect id="a" value="199" onChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveDisplayValue('100 – 199');
  });

  it('Given an older number that is not a range, Then it is kept as its own selected option', () => {
    render(<AttendanceSelect id="a" value="120" onChange={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveValue('120');
    expect(options()[0]).toBe('120');
    expect(options()).not.toContain('Select a range');
  });

  it('When a range is picked, Then its value is reported', async () => {
    const onChange = vi.fn();
    render(<AttendanceSelect id="a" value="" onChange={onChange} />);

    await userEvent.selectOptions(screen.getByRole('combobox'), '50 – 99');

    expect(onChange).toHaveBeenCalledWith('99');
  });
});
