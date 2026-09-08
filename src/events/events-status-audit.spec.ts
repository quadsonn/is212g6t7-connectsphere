import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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

  /** The single sanctioned writer. */
  const ALLOWED_FILE = 'events/events.service.ts';

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      if (!entry.endsWith('.ts')) return [];
      if (entry.endsWith('.spec.ts')) return [];
      return [full];
    });

  const files = sourceFiles(SRC);

  /** Matches a Prisma `data: { ... status: ... }` payload. */
  const STATUS_WRITE = /data:\s*\{[^{}]*\bstatus\s*:/g;

  it('finds source files to audit (guards against a broken scan)', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('events.service.ts'))).toBe(true);
  });

  it('writes EventRequest.status in exactly one place', () => {
    const offenders = files.flatMap((file) => {
      const matches = readFileSync(file, 'utf8').match(STATUS_WRITE) ?? [];
      return matches.map(() => relative(SRC, file));
    });

    expect(offenders).toEqual([ALLOWED_FILE]);
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
    expect(setStatusBody).toMatch(/data:\s*\{\s*status:\s*next\s*\}/);
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
    expect(smuggled.match(STATUS_WRITE)).toHaveLength(1);

    const innocent = `
      await this.prisma.eventRequest.update({
        where: { id },
        data: { decisionReason: reason },
      });
    `;
    expect(innocent.match(STATUS_WRITE)).toBeNull();
  });
});
