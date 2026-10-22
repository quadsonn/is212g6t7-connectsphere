import { describe, expect, it } from 'vitest';

import { ROLES } from '@/types/api';
import { ROLE_THEME } from './role-theme';

describe('ROLE_THEME', () => {
  it('gives every role its own colour', () => {
    const strips = ROLES.map((role) => ROLE_THEME[role].strip);
    expect(new Set(strips).size).toBe(ROLES.length);
  });

  it('keeps clear of the status colours (red, amber, green)', () => {
    for (const role of ROLES) {
      expect(Object.values(ROLE_THEME[role]).join(' ')).not.toMatch(/\b\w+-(red|rose|amber|green|emerald)-/);
    }
  });
});
