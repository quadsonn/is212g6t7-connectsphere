import { PrismaClient } from '@prisma/client';

import { formatReadableId, ID_PREFIX, nextReadableId, nextReadableIds } from './readable-id';

/** Readable IDs (CLAUDE.md, "IDs"): prefix, dash, number zero-padded to 3 digits. */
describe('readable IDs', () => {
  it('formats prefix + zero-padded number, growing past 999', () => {
    expect(formatReadableId('BSG', 1)).toBe('BSG-001');
    expect(formatReadableId('ESC', 42)).toBe('ESC-042');
    expect(formatReadableId('BSG', 999)).toBe('BSG-999');
    expect(formatReadableId('BSG', 1000)).toBe('BSG-1000');
  });

  it('uses BSG for BookingSuggestion and ESC for EquipmentStatusChange', () => {
    expect(ID_PREFIX).toEqual({ BookingSuggestion: 'BSG', EquipmentStatusChange: 'ESC' });
  });

  describe('taking numbers from the counter', () => {
    const counterAt = (last: number) =>
      ({ $queryRaw: jest.fn().mockResolvedValue([{ last }]) }) as unknown as PrismaClient & {
        $queryRaw: jest.Mock;
      };

    it('returns the counter value it moved to', async () => {
      const db = counterAt(7);

      await expect(nextReadableId(db, 'BookingSuggestion')).resolves.toBe('BSG-007');
    });

    it('takes a block of numbers in one statement for several rows', async () => {
      // The counter moved from 4 to 7: this caller owns 5, 6 and 7.
      const db = counterAt(7);

      await expect(nextReadableIds(db, 'EquipmentStatusChange', 3)).resolves.toEqual([
        'ESC-005',
        'ESC-006',
        'ESC-007',
      ]);
      expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('asks for nothing when no rows are being created', async () => {
      const db = counterAt(7);

      await expect(nextReadableIds(db, 'BookingSuggestion', 0)).resolves.toEqual([]);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
