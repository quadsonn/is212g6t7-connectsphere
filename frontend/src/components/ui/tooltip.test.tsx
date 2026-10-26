import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('shows on keyboard focus, hides on blur', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Full details">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    await user.tab();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Full details');
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Full details');

    await user.tab();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Full details">
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    await user.hover(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps the trigger\'s own handlers', async () => {
    const user = userEvent.setup();
    let focused = false;
    render(
      <Tooltip content="Full details">
        <button type="button" onFocus={() => (focused = true)}>Trigger</button>
      </Tooltip>,
    );

    await user.tab();
    expect(focused).toBe(true);
  });
});
