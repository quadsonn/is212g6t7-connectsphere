import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';

import {
  compareReadableIds,
  formatReadableId,
  ID_PREFIX,
  inEntryOrder,
  nextReadableId,
} from './readable-id';

/** Readable IDs (CLAUDE.md, "IDs"): prefix, dash, number zero-padded to 3 digits. */
describe('readable IDs', () => {
  it('formats prefix + zero-padded number, growing past 999', () => {
    expect(formatReadableId('BSG', 1)).toBe('BSG-001');
    expect(formatReadableId('ESC', 42)).toBe('ESC-042');
    expect(formatReadableId('BSG', 999)).toBe('BSG-999');
    expect(formatReadableId('BSG', 1000)).toBe('BSG-1000');
  });

  describe('every model has a prefix, and its schema default uses it', () => {
    const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
    // IdCounter is keyed by the prefix itself.
    const models = Object.values(Prisma.ModelName).filter((m) => m !== 'IdCounter');

    it.each(models)('%s', (model) => {
      const prefix = ID_PREFIX[model as keyof typeof ID_PREFIX];
      expect(prefix).toMatch(/^[A-Z]{3}$/);

      const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1] ?? '';
      expect(body).toContain(`@default(dbgenerated("next_readable_id('${prefix}'::text)"))`);
      expect(body).not.toContain('cuid()');
    });

    it('no two models share a prefix, and no prefix is left over', () => {
      const prefixes = Object.values(ID_PREFIX);
      expect(new Set(prefixes).size).toBe(prefixes.length);
      expect(Object.keys(ID_PREFIX).sort()).toEqual([...models].sort());
    });
  });

  it('nextReadableId asks the database function, so it shares the column default’s counter', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'VEN-054' }]) };

    await expect(nextReadableId(db as unknown as PrismaClient, 'Venue')).resolves.toBe('VEN-054');
    const [sql, ...values] = db.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('next_readable_id(');
    expect(values).toEqual(['VEN']);
  });

  describe('ordering by ID number, which text order gets wrong past 999', () => {
    it('puts REQ-999 before REQ-1000', () => {
      expect(['REQ-1000', 'REQ-999', 'REQ-010'].sort(compareReadableIds)).toEqual([
        'REQ-010',
        'REQ-999',
        'REQ-1000',
      ]);
    });

    it('falls back to text order for anything that is not a readable ID', () => {
      expect(compareReadableIds('b', 'a')).toBeGreaterThan(0);
      expect(compareReadableIds('REQ-001', 'VEN-001')).toBeLessThan(0);
    });

    it('lists rows oldest first, and one save’s rows by ID number', () => {
      const saved = new Date('2030-01-01T00:00:00Z');
      const later = new Date('2030-01-02T00:00:00Z');
      const rows = [
        { id: 'REQ-1001', createdAt: later },
        { id: 'REQ-1000', createdAt: saved },
        { id: 'REQ-999', createdAt: saved },
      ];

      expect(inEntryOrder(rows).map((r) => r.id)).toEqual(['REQ-999', 'REQ-1000', 'REQ-1001']);
    });
  });
});
