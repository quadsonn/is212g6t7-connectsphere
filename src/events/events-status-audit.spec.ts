import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative as relativePath } from 'node:path';

/** Posix-style relative path, so comparisons work the same on Windows. */
const relative = (from: string, to: string) => relativePath(from, to).replace(/\\/g, '/');

/**
 * US-11 — the guard rail.
 *
 * CLAUDE.md §3.4 and §11 require that an event's status changes only through a
 * validated transition. This suite reads the source and fails if any code
 * writes EventRequest.status outside EventsService.setStatus().
 *
 * It is deliberately a source scan rather than a runtime check: a direct write
 * added in a new story would otherwise pass every behavioural test, because
 * nothing at runtime distinguishes a legitimate update from a smuggled one.
 */
describe('status write audit (US-11)', () => {
  const SRC = join(__dirname, '..');

  /** The single sanctioned writer of each model's status column. */
  const ALLOWED_FILE = 'events/events.service.ts';
  const ALLOWED_VENUE_FILE = 'venues/venues.service.ts';
  const ALLOWED_RESERVATION_FILE = 'equipment/equipment-reservations.service.ts';
  const ALLOWED_EQUIPMENT_STATUS_FILE = 'equipment/equipment.service.ts';

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      if (!entry.endsWith('.ts')) return [];
      if (entry.endsWith('.spec.ts')) return [];
      return [full];
    });

  const files = sourceFiles(SRC);

  /**
   * Matches a status write on a specific Prisma delegate, e.g.
   * `eventRequest.update({ where: ..., data: { status: ... } })`.
   *
   * Scoped per model so each lifecycle is guarded independently: an event's
   * status is owned by setStatus(), a venue's by publish().
   */
  const statusWriteOn = (delegate: string) =>
    new RegExp(
      `${delegate}\\.(update|updateMany|create|createMany|upsert)\\(\\s*\\{[\\s\\S]{0,200}?data:\\s*\\{[^{}]*\\bstatus\\s*:`,
      'g',
    );

  it('finds source files to audit (guards against a broken scan)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('events.service.ts'))).toBe(true);
  });

  it('writes EventRequest.status in exactly one place', () => {
    const offenders = files.flatMap((file) => {
      const matches =
        readFileSync(file, 'utf8').match(statusWriteOn('eventRequest')) ?? [];
      return matches.map(() => relative(SRC, file));
    });

    expect(offenders).toEqual([ALLOWED_FILE]);
  });

  it('writes Venue.status in exactly one place', () => {
    // A venue's lifecycle is only DRAFT -> PUBLISHED, but the same rule
    // applies: one writer, guarded by a completeness check (US-13 AC-3).
    const offenders = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(statusWriteOn('venue')) ?? [];
      return matches.map(() => relative(SRC, file));
    });

    expect(offenders).toEqual([ALLOWED_VENUE_FILE]);
  });

  it('writes EquipmentReservation.status in exactly one file (US-31/US-32)', () => {
    // A commitment is created APPROVED (US-31) and leaves that status only by
    // release on cancellation (US-32) — both in the reservations service.
    const offenders = files.flatMap((file) => {
      const matches =
        readFileSync(file, 'utf8').match(statusWriteOn('equipmentReservation')) ?? [];
      return matches.map(() => relative(SRC, file));
    });

    expect([...new Set(offenders)]).toEqual([ALLOWED_RESERVATION_FILE]);
  });

  /** US-45 — the column is `operationalStatus`, which `\bstatus` misses. */
  const operationalStatusWrite =
    /equipment\.(update|updateMany|create|createMany|upsert)\(\s*\{[\s\S]{0,200}?data:\s*\{[^{}]*\boperationalStatus\s*:/g;

  it('writes Equipment.operationalStatus in exactly one place (US-45)', () => {
    // Only changeStatus() moves an item between statuses, so every change is
    // validated and recorded with its reason (AC-2).
    const offenders = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(operationalStatusWrite) ?? [];
      return matches.map(() => relative(SRC, file));
    });

    expect(offenders).toEqual([ALLOWED_EQUIPMENT_STATUS_FILE]);
  });

  it('records a reason alongside that write (US-45 AC-2)', () => {
    const source = readFileSync(join(SRC, ALLOWED_EQUIPMENT_STATUS_FILE), 'utf8');
    const changeBody = source.slice(
      source.indexOf('async changeStatus('),
      source.indexOf('private async findDetail('),
    );

    expect(changeBody).toMatch(/statusChangeError\(/);
    expect(changeBody).toMatch(/data:\s*\{\s*operationalStatus:\s*dto\.status\s*\}/);
    expect(changeBody).toMatch(/equipmentStatusChange\.create\(/);
    expect(changeBody).toMatch(/reason:\s*dto\.reason/);
  });

  it('detects an operationalStatus write if one were introduced (US-45)', () => {
    const smuggled = `
      await this.prisma.equipment.update({
        where: { id },
        data: { operationalStatus: EquipmentStatus.OPERATIONAL },
      });
    `;
    expect(smuggled.match(operationalStatusWrite)).toHaveLength(1);
  });

  it('confines the reservation release to the RELEASABLE_STATUSES filter (US-33 AC-4)', () => {
    const source = readFileSync(join(SRC, ALLOWED_RESERVATION_FILE), 'utf8');
    const releaseBody = source.slice(
      source.indexOf('async releaseForCancelledEvent('),
      source.indexOf('async findReleased('),
    );

    expect(releaseBody).toMatch(
      /where:\s*\{\s*eventId,\s*status:\s*\{\s*in:\s*\[\.\.\.RELEASABLE_STATUSES\]\s*\}\s*\}/,
    );
  });

  it('guards the venue write behind the publishable check', () => {
    const source = readFileSync(join(SRC, ALLOWED_VENUE_FILE), 'utf8');
    const publishBody = source.slice(
      source.indexOf('async publish('),
      source.indexOf('private async findManaged('),
    );

    expect(publishBody).toMatch(/assertPublishable\(/);
    expect(publishBody).toMatch(/data:\s*\{\s*status:\s*VenueStatus\.PUBLISHED\s*\}/);
  });

  it('makes that one write the setStatus transition', () => {
    const source = readFileSync(join(SRC, ALLOWED_FILE), 'utf8');

    // The sanctioned write sits inside setStatus, immediately after the
    // canTransition guard.
    const setStatusBody = source.slice(
      source.indexOf('async setStatus('),
      source.indexOf('async findAllForUser('),
    );

    expect(setStatusBody).toMatch(/canTransition\(/);
    // submittedAt rides along on the move to SUBMITTED; the status value
    // written is still exactly `next`, which the canTransition guard vetted.
    expect(setStatusBody).toMatch(/data:\s*\{\s*status:\s*next,/);
  });

  it('never writes status through raw SQL', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        /\$executeRaw|\$queryRaw/.test(source) &&
        /UPDATE\s+"?EventRequest"?/i.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });

  it('never writes status through updateMany', () => {
    const offenders = files.filter((file) =>
      /eventRequest\.updateMany/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('detects a violation if one were introduced', () => {
    // Proves the regex actually catches the thing it claims to. If this ever
    // stops matching, the audit above is vacuous.
    const smuggled = `
      await this.prisma.eventRequest.update({
        where: { id },
        data: { status: EventStatus.APPROVED },
      });
    `;
    expect(smuggled.match(statusWriteOn('eventRequest'))).toHaveLength(1);

    const innocent = `
      await this.prisma.eventRequest.update({
        where: { id },
        data: { decisionReason: reason },
      });
    `;
    expect(innocent.match(statusWriteOn('eventRequest'))).toBeNull();
  });
});
