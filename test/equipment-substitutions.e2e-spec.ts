import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  SubstitutionStatus,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * Equipment substitutions e2e. When Technical Support takes an item out of
 * use and it is reserved for a CONFIRMED event, they must suggest a
 * replacement (or say there is none); earlier-stage events need nothing. The
 * event's Coordinator accepts, or declines and acknowledges. One describe per
 * rule so a failing test names the rule it breaks.
 *
 * Code under test: EquipmentService.changeStatus ->
 * EquipmentSubstitutionsService (recordForStatusChange, candidatesFor,
 * suggest, accept, decline, voidForRestoredItem) and EquipmentNotifier (US-67).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s4-110-setup.sql (wireless and lapel microphones, the CONFIRMED "gala"
 * EVT-313 and its 2-microphone reservation RSV-038). The seed helpers below
 * load the other events and items from tc-s4-110b to 110g.
 */
describe('Equipment substitutions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s4-110-setup; the seed helpers add the rest. */
  const ids: Record<string, string> = {
    tech: 'USR-009',
    coordinator: 'USR-004',
    otherCoordinator: 'USR-005',
    organiser: 'USR-006',
    mic: 'EQP-026',
    lapel: 'EQP-027',
    gala: 'EVT-313',
    galaMic: 'RSV-038',
  };
  const LOGINS: Record<string, string> = {
    tech: 'tech.support@example.com',
    coordinator: 'coord.a@example.com',
    otherCoordinator: 'coord.b@example.com',
    organiser: 'organiser@example.com',
  };

  // Far enough ahead to stay "upcoming" whenever the suite runs.
  const START = '2030-10-01T09:00:00.000Z';
  const END = '2030-10-01T17:00:00.000Z';

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const changeStatus = (
    equipmentId: string,
    body: Record<string, unknown>,
    who = 'tech',
  ) =>
    http()
      .patch(`/equipment/${equipmentId}/status`)
      .set('Authorization', as(who))
      .send(body);

  const damage = (
    equipmentId: string,
    substitutions?: Record<string, unknown>[],
  ) =>
    changeStatus(equipmentId, {
      status: EquipmentStatus.OUT_OF_SERVICE,
      reason: 'Cracked casing.',
      ...(substitutions ? { substitutions } : {}),
    });

  const decide = (
    substitutionId: string,
    action: 'accept' | 'decline',
    who = 'coordinator',
  ) =>
    http()
      .post(`/equipment-substitutions/${substitutionId}/${action}`)
      .set('Authorization', as(who));

  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /** Extra items: [script, id]. tc-s4-110g also holds "broken", already out of service. */
  const EQUIPMENT: Record<string, [string | null, string]> = {
    scarce: ['tc-s4-110e-setup', 'EQP-028'],
    pair: ['tc-s4-110f-setup', 'EQP-029'],
    wireless2: ['tc-s4-110g-setup', 'EQP-030'],
    broken: [null, 'EQP-031'],
  };
  const seedEquipment = async (key: string, _type: string, _totalQuantity: number) => {
    const [script, id] = EQUIPMENT[key];
    if (script) await given(script);
    ids[key] = id;
  };

  /** Extra events, each with its reservation: [script, event id, reservation key, reservation id]. */
  const EVENTS: Record<string, [string, string, string, string]> = {
    retreat: ['tc-s4-110b-setup', 'EVT-314', 'retreatMic', 'RSV-039'],
    summit: ['tc-s4-110c-setup', 'EVT-315', 'summitMic', 'RSV-040'],
    rival: ['tc-s4-110d-setup', 'EVT-316', 'rivalLapel', 'RSV-041'],
  };
  const seedEvent = async (key: string, _status: EventStatus) => {
    const [script, id, reservationKey, reservationId] = EVENTS[key];
    await given(script);
    ids[key] = id;
    ids[reservationKey] = reservationId;
  };
  /** The reservation comes with its event's script (seedEvent); this only names it. */
  const seedReservation = async (
    key: string,
    _eventKey: string,
    _equipmentKey: string,
    _quantity: number,
  ) => {
    if (!ids[key]) throw new Error(`seed the event for ${key} first`);
  };

  const substitutionFor = (reservationKey: string) =>
    prisma.equipmentSubstitution.findFirst({
      where: {
        reservationId: ids[reservationKey],
        status: { not: SubstitutionStatus.VOID },
      },
    });

  const flagFor = async (eventKey: string, who = 'coordinator') => {
    const res = await http()
      .get(`/events/assigned/${ids[eventKey]}`)
      .set('Authorization', as(who))
      .expect(200);
    return res.body.unavailableEquipment as Array<Record<string, any>>;
  };

  // Every table, whatever earlier test files left behind (localhost and a
  // _test database only — resetDb checks before it deletes anything).
  const clear = () => resetDb(prisma);
  /** tc-s4-110i/j/k: the gala in a finished status. */
  const FINISHED: Record<string, string> = {
    [EventStatus.COMPLETED]: 'tc-s4-110i-setup',
    [EventStatus.CANCELLED]: 'tc-s4-110j-setup',
    [EventStatus.REJECTED]: 'tc-s4-110k-setup',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    prisma = new PrismaClient();

    // Users keep their fixed IDs after every reset, so these tokens stay valid.
    await resetDb(prisma);
    await given('base-users');
    for (const [key, email] of Object.entries(LOGINS)) {
      const res = await http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
      tokens[key] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();
    await given('base-users', 'tc-s4-110-setup');
  });

  describe('a confirmed event needs an answer before the item is taken out of use', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if an item reserved for a confirmed event can be taken out of use without a suggested replacement or a "no valid alternative" answer
    // Code: EquipmentService.changeStatus -> EquipmentSubstitutionsService.recordForStatusChange
    it('400s with no substitution, and leaves the item in service with no change recorded', async () => {
      const res = await damage(ids.mic).expect(400);

      expect(JSON.stringify(res.body)).toContain(ids.galaMic);
      const item = await prisma.equipment.findUniqueOrThrow({
        where: { id: ids.mic },
      });
      expect(item.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if an item reserved for a confirmed event can be taken out of use without a suggested replacement or a "no valid alternative" answer
    // Code: EquipmentService.changeStatus -> EquipmentSubstitutionsService.recordForStatusChange
    it('accepts a replacement from the catalogue and records it PENDING', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);

      const substitution = await substitutionFor('galaMic');
      expect(substitution).toMatchObject({
        status: SubstitutionStatus.PENDING,
        alternativeEquipmentId: ids.lapel,
        suggestedById: ids.tech,
      });
      const item = await prisma.equipment.findUniqueOrThrow({
        where: { id: ids.mic },
      });
      expect(item.operationalStatus).toBe(EquipmentStatus.OUT_OF_SERVICE);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if an item reserved for a confirmed event can be taken out of use without a suggested replacement or a "no valid alternative" answer
    // Code: EquipmentService.changeStatus -> EquipmentSubstitutionsService.recordForStatusChange
    it('accepts "no valid alternative" as an answer', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);

      expect(await substitutionFor('galaMic')).toMatchObject({
        status: SubstitutionStatus.PENDING,
        alternativeEquipmentId: null,
      });
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110h-setup · fails if an item reserved for a confirmed event can be taken out of use without a suggested replacement or a "no valid alternative" answer
    // Code: EquipmentService.changeStatus -> EquipmentSubstitutionsService.recordForStatusChange
    it('also requires one for a merely requested reservation on a confirmed event', async () => {
      await given('tc-s4-110h-setup'); // the gala's reservation only requested

      await damage(ids.mic).expect(400);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if an item reserved for a confirmed event can be taken out of use without a suggested replacement or a "no valid alternative" answer
    // Code: EquipmentService.changeStatus -> EquipmentSubstitutionsService.recordForStatusChange
    it.each([
      [
        'both an item and "no alternative"',
        { alternativeEquipmentId: 'x', noAlternative: true },
      ],
      ['neither', {}],
    ])('400s on %s', async (_label, answer) => {
      await damage(ids.mic, [{ reservationId: ids.galaMic, ...answer }]).expect(
        400,
      );
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });
  });

  describe('an answer naming an item that does not exist', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if taking an item out of use is accepted with a replacement that does not exist
    // Code: EquipmentSubstitutionsService.recordForStatusChange -> lock (the item row; not found 404)
    it('404s and leaves the item in service', async () => {
      await damage(ids.mic, [{ reservationId: ids.galaMic, alternativeEquipmentId: 'EQP-999' }]).expect(404);

      expect((await prisma.equipment.findUniqueOrThrow({ where: { id: ids.mic } })).operationalStatus).toBe(
        EquipmentStatus.OPERATIONAL,
      );
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });
  });

  describe('a finished event is left alone', () => {
    // TC-S4-107 · US-67 AC-1 · setup: base-users + tc-s4-110-setup + tc-s4-110i-setup + tc-s4-110j-setup + tc-s4-110k-setup · fails if a completed, cancelled or rejected event is told, flagged or asked for a replacement
    // Code: EquipmentService.changeStatus (upcoming committed reservations only)
    it.each([
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])(
      'a %s event gets no notice, no flag and needs no replacement',
      async (status) => {
        await given(FINISHED[status]);

        const res = await damage(ids.mic).expect(200);

        expect(res.body.affectedReservations).toEqual([]);
        expect(
          await prisma.notification.count({
            where: { recipientId: ids.coordinator },
          }),
        ).toBe(0);
        expect(await prisma.equipmentSubstitution.count()).toBe(0);
        expect(await flagFor('gala')).toEqual([]);
      },
    );

    // TC-S4-107 · US-67 AC-1 · setup: base-users + tc-s4-110-setup + tc-s4-110b-setup + tc-s4-110i-setup · fails if a live event with a committed reservation on the item is not told, while a finished one is
    // Code: EquipmentService.changeStatus -> EquipmentNotifier.unavailable (upcoming committed reservations only)
    it('still warns about, and notifies, a live event using the same item', async () => {
      await given('tc-s4-110i-setup'); // the gala is over
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);

      const res = await damage(ids.mic).expect(200);

      expect(
        res.body.affectedReservations.map((r: { id: string }) => r.id),
      ).toEqual([ids.retreatMic]);
      expect(
        await prisma.notification.count({
          where: { recipientId: ids.coordinator },
        }),
      ).toBe(1);
    });
  });

  describe('an event before the confirmed stage needs no replacement', () => {
    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110b-setup · fails if an event still in planning is not told the item is unavailable, or is wrongly asked for a replacement
    // Code: EquipmentNotifier.unavailable; recordForStatusChange (CONFIRMED events only)
    it('marks the item unavailable without one, as before', async () => {
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);
      await prisma.equipmentReservation.delete({ where: { id: ids.galaMic } });

      const res = await damage(ids.mic).expect(200);

      expect(res.body.affectedReservations).toHaveLength(1);
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110b-setup · fails if an event still in planning is not told the item is unavailable, or is wrongly asked for a replacement
    // Code: EquipmentNotifier.unavailable; recordForStatusChange (CONFIRMED events only)
    it('requires an answer only for the confirmed one when both are affected', async () => {
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);

      await damage(ids.mic).expect(400);
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);

      expect(await prisma.equipmentSubstitution.count()).toBe(1);
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110b-setup · fails if an event still in planning is not told the item is unavailable, or is wrongly asked for a replacement
    // Code: EquipmentNotifier.unavailable; recordForStatusChange (CONFIRMED events only)
    it('400s on an answer for a reservation that needs none', async () => {
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);

      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
        { reservationId: ids.retreatMic, noAlternative: true },
      ]).expect(400);
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });
  });

  describe('the replacement must hold up', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110e-setup · fails if a replacement that cannot cover the same quantity, is itself out of service, is the same item, or is overdrawn is accepted
    // Code: EquipmentSubstitutionsService.recordForStatusChange (equipment-substitution rules)
    it('409s, saving nothing, when the alternative cannot cover the same quantity', async () => {
      await seedEquipment('scarce', 'Handheld microphone', 1);

      const res = await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.scarce },
      ]).expect(409);

      expect(res.body.message).toMatch(/must match the original quantity/);
      const item = await prisma.equipment.findUniqueOrThrow({
        where: { id: ids.mic },
      });
      expect(item.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
      expect(await prisma.equipmentStatusChange.count()).toBe(0);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110l-setup · fails if a replacement that cannot cover the same quantity, is itself out of service, is the same item, or is overdrawn is accepted
    // Code: EquipmentSubstitutionsService.recordForStatusChange (equipment-substitution rules)
    it('409s when the alternative is itself out of service', async () => {
      await given('tc-s4-110l-setup'); // the lapel microphones are under maintenance

      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(409);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if a replacement that cannot cover the same quantity, is itself out of service, is the same item, or is overdrawn is accepted
    // Code: EquipmentSubstitutionsService.recordForStatusChange (equipment-substitution rules)
    it('400s when an item is offered as its own replacement', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.mic },
      ]).expect(400);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110f-setup + tc-s4-110c-setup · fails if a replacement that cannot cover the same quantity, is itself out of service, is the same item, or is overdrawn is accepted
    // Code: EquipmentSubstitutionsService.recordForStatusChange (equipment-substitution rules)
    it('409s when two reservations would together overdraw the one alternative', async () => {
      await seedEquipment('pair', 'Handheld microphone', 3);
      await seedEvent('summit', EventStatus.CONFIRMED);
      await seedReservation('summitMic', 'summit', 'mic', 2);

      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.pair },
        { reservationId: ids.summitMic, alternativeEquipmentId: ids.pair },
      ]).expect(409);

      expect(await prisma.equipmentSubstitution.count()).toBe(0);
      const item = await prisma.equipment.findUniqueOrThrow({
        where: { id: ids.mic },
      });
      expect(item.operationalStatus).toBe(EquipmentStatus.OPERATIONAL);
    });
  });

  describe('Technical Support picks from the dropdown', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110f-setup + tc-s4-110q-setup · fails if alternatives of the same type are listed in an unstable order
    // Code: EquipmentSubstitutionsService.candidatesFor (sort: same type, then type, then id)
    it('lists alternatives of one type by id, after sorting by type', async () => {
      await seedEquipment('pair', 'Handheld microphone', 3);
      await given('tc-s4-110q-setup'); // EQP-032, four more handheld microphones

      const res = await http()
        .get(`/equipment/reservations/${ids.galaMic}/alternatives`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([ids.pair, 'EQP-032', ids.lapel]);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110d-setup · fails if an item another event holds too much of is offered, or an unknown reservation does not give 404
    // Code: EquipmentSubstitutionsService.candidatesFor (other events' holdings; reservation not found)
    it('leaves out an item another event holds too much of, and 404s an unknown reservation', async () => {
      await seedEvent('rival', EventStatus.PLANNING); // holds 9 of the 10 lapel microphones
      const alternatives = (reservationId: string) =>
        http().get(`/equipment/reservations/${reservationId}/alternatives`).set('Authorization', as('tech'));

      const res = await alternatives(ids.galaMic).expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).not.toContain(ids.lapel);
      await alternatives('RSV-999').expect(404);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110g-setup + tc-s4-110e-setup · fails if the alternatives list misses an item free in full, puts other types first, offers the item itself or one out of service, or is open to the Coordinator
    // Code: EquipmentSubstitutionsService.candidatesFor
    it('lists items with the full quantity free, same type first, never the item itself', async () => {
      await seedEquipment('wireless2', 'wireless microphone', 5);
      await seedEquipment('scarce', 'Handheld microphone', 1);
      await seedEquipment('broken', 'Boundary microphone', 10);
      // "broken" is already out of service in tc-s4-110g-setup.

      const res = await http()
        .get(`/equipment/reservations/${ids.galaMic}/alternatives`)
        .set('Authorization', as('tech'))
        .expect(200);

      expect(res.body.map((c: { id: string }) => c.id)).toEqual([
        ids.wireless2,
        ids.lapel,
      ]);
      expect(res.body[0]).toMatchObject({
        sameType: true,
        availableQuantity: 5,
      });
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if the alternatives list misses an item free in full, puts other types first, offers the item itself or one out of service, or is open to the Coordinator
    // Code: EquipmentSubstitutionsService.candidatesFor
    it('is closed to the Coordinator', async () => {
      await http()
        .get(`/equipment/reservations/${ids.galaMic}/alternatives`)
        .set('Authorization', as('coordinator'))
        .expect(403);
    });
  });

  describe('the Coordinator is told, and sees the proposal on the flag', () => {
    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup · fails if the Coordinator is not told the item is unavailable with the suggestion, or cannot see it beside the flag
    // Code: EquipmentNotifier.unavailable; event detail unavailableEquipment
    it('notifies the Coordinator with the suggestion and shows it beside the flag', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);

      const notice = await prisma.notification.findFirstOrThrow({
        where: {
          recipientId: ids.coordinator,
          type: NotificationType.EQUIPMENT_UNAVAILABLE,
        },
      });
      expect(notice.message).toContain(
        '2 × "Lapel microphone" instead of "Wireless microphone"',
      );

      const flag = await flagFor('gala');
      expect(flag).toHaveLength(1);
      expect(flag[0].substitution).toMatchObject({
        status: 'PENDING',
        alternativeEquipment: { id: ids.lapel, type: 'Lapel microphone' },
      });
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup · fails if the Coordinator is not told the item is unavailable with the suggestion, or cannot see it beside the flag
    // Code: EquipmentNotifier.unavailable; event detail unavailableEquipment
    it('says plainly when there is no valid alternative', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);

      const notice = await prisma.notification.findFirstOrThrow({
        where: {
          recipientId: ids.coordinator,
          type: NotificationType.EQUIPMENT_UNAVAILABLE,
        },
      });
      expect(notice.message).toContain(
        'no valid alternative for 2 × "Wireless microphone"',
      );
      expect(
        (await flagFor('gala'))[0].substitution.alternativeEquipment,
      ).toBeNull();
    });
  });

  describe('the Coordinator accepts the replacement', () => {
    beforeEach(async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('rebooks the same quantity and window on the alternative and releases the original', async () => {
      const sub = (await substitutionFor('galaMic'))!;

      const res = await decide(sub.id, 'accept').expect(200);
      expect(res.body.status).toBe('ACCEPTED');

      const original = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: ids.galaMic },
      });
      expect(original.status).toBe(ReservationStatus.RELEASED);
      expect(original.releasedAt).not.toBeNull();

      const replacement = await prisma.equipmentReservation.findUniqueOrThrow({
        where: { id: original.replacedById! },
      });
      expect(replacement).toMatchObject({
        eventId: ids.gala,
        equipmentId: ids.lapel,
        quantity: 2,
        status: ReservationStatus.APPROVED,
      });
      expect(replacement.start.toISOString()).toBe(START);
      expect(replacement.end.toISOString()).toBe(END);

      const stored = await prisma.equipmentSubstitution.findUniqueOrThrow({
        where: { id: sub.id },
      });
      expect(stored).toMatchObject({
        status: SubstitutionStatus.ACCEPTED,
        decidedById: ids.coordinator,
        resultReservationId: replacement.id,
      });
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('repoints the matching required-equipment line at the alternative', async () => {
      // Kept by design: written after the suggestion, as the scenario needs.
      const line = await prisma.equipmentRequirement.create({
        data: {
          eventId: ids.gala,
          equipmentId: ids.mic,
          equipmentType: 'Wireless microphone',
          quantity: 2,
          notes: 'For the keynote.',
        },
      });
      await decide((await substitutionFor('galaMic'))!.id, 'accept').expect(
        200,
      );

      const after = await prisma.equipmentRequirement.findUniqueOrThrow({
        where: { id: line.id },
      });
      expect(after).toMatchObject({
        equipmentId: ids.lapel,
        equipmentType: 'Lapel microphone',
        quantity: 2,
      });
      expect(after.notes).toBe(
        'For the keynote. Replaced Wireless microphone, which went out of service.',
      );
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('splits a larger line, moving only the swapped quantity to the alternative', async () => {
      // Kept by design: written after the suggestion, as the scenario needs.
      await prisma.equipmentRequirement.create({
        data: {
          eventId: ids.gala,
          equipmentId: ids.mic,
          equipmentType: 'Wireless microphone',
          quantity: 5,
        },
      });
      await decide((await substitutionFor('galaMic'))!.id, 'accept').expect(
        200,
      );

      const lines = await prisma.equipmentRequirement.findMany({
        where: { eventId: ids.gala },
        orderBy: { createdAt: 'asc' },
      });
      expect(lines.map((l) => [l.equipmentId, l.quantity])).toEqual([
        [ids.mic, 3],
        [ids.lapel, 2],
      ]);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('leaves the event ready to confirm: the new line counts as reserved', async () => {
      // Kept by design: written after the suggestion, as the scenario needs.
      await prisma.equipmentRequirement.create({
        data: {
          eventId: ids.gala,
          equipmentId: ids.mic,
          equipmentType: 'Wireless microphone',
          quantity: 2,
        },
      });
      await decide((await substitutionFor('galaMic'))!.id, 'accept').expect(
        200,
      );

      const requirement = await prisma.equipmentRequirement.findFirstOrThrow({
        where: { eventId: ids.gala },
      });
      const reserved = await prisma.equipmentReservation.findMany({
        where: {
          eventId: ids.gala,
          equipmentId: requirement.equipmentId!,
          status: ReservationStatus.APPROVED,
        },
      });
      expect(
        reserved.reduce((n, r) => n + r.quantity, 0),
      ).toBeGreaterThanOrEqual(requirement.quantity);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('clears the flag, and tells Technical Support', async () => {
      const sub = (await substitutionFor('galaMic'))!;
      await decide(sub.id, 'accept').expect(200);

      expect(await flagFor('gala')).toEqual([]);
      const told = await prisma.notification.findFirstOrThrow({
        where: {
          recipientId: ids.tech,
          type: NotificationType.EQUIPMENT_SUBSTITUTE_DECIDED,
        },
      });
      expect(told.message).toContain('accepted the replacement');
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('cannot be decided twice', async () => {
      const sub = (await substitutionFor('galaMic'))!;
      await decide(sub.id, 'accept').expect(200);

      await decide(sub.id, 'accept').expect(409);
      await decide(sub.id, 'decline').expect(409);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110d-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('409s, staying PENDING, when the alternative has filled up since; declining still works', async () => {
      await seedEvent('rival', EventStatus.PLANNING);
      await seedReservation('rivalLapel', 'rival', 'lapel', 9);
      const sub = (await substitutionFor('galaMic'))!;

      const res = await decide(sub.id, 'accept').expect(409);

      expect(res.body.message).toMatch(/no longer has 2 free/);
      expect((await substitutionFor('galaMic'))!.status).toBe(
        SubstitutionStatus.PENDING,
      );
      expect(
        (
          await prisma.equipmentReservation.findUniqueOrThrow({
            where: { id: ids.galaMic },
          })
        ).status,
      ).toBe(ReservationStatus.APPROVED);

      await decide(sub.id, 'decline').expect(200);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('409s when the alternative has since gone out of service', async () => {
      // Kept by design: the state changes after the suggestion was made.
      await prisma.equipment.update({
        where: { id: ids.lapel },
        data: { operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
      });
      const sub = (await substitutionFor('galaMic'))!;

      const res = await decide(sub.id, 'accept').expect(409);
      expect(res.body.message).toMatch(/no longer in service/);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if accepting does not rebook on the alternative and release the original, repoint the requirement, clear the flag and tell Technical Support, or is allowed twice or when it no longer holds
    // Code: EquipmentSubstitutionsService.accept -> EquipmentNotifier.substituteDecided
    it('409s when the event is no longer confirmed', async () => {
      // Kept by design: the state changes after the suggestion was made.
      await prisma.eventRequest.update({
        where: { id: ids.gala },
        data: { status: EventStatus.PLANNING },
      });
      const sub = (await substitutionFor('galaMic'))!;

      await decide(sub.id, 'accept').expect(409);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if a replacement is accepted for a reservation released since, or an original item back in service since
    // Code: EquipmentSubstitutionsService.accept (reservation no longer active; original back in service)
    it('409s once the reservation is released, or the original item is back in service', async () => {
      const sub = (await substitutionFor('galaMic'))!;

      // Kept by design: the state changes after the suggestion was made.
      await prisma.equipment.update({ where: { id: ids.mic }, data: { operationalStatus: EquipmentStatus.OPERATIONAL } });
      expect((await decide(sub.id, 'accept').expect(409)).body.message).toMatch(/back in service/);

      await prisma.equipmentReservation.update({ where: { id: ids.galaMic }, data: { status: ReservationStatus.RELEASED } });
      expect((await decide(sub.id, 'accept').expect(409)).body.message).toMatch(/no longer active/);
      expect(sub.status).toBe(SubstitutionStatus.PENDING);
    });
  });

  describe('the Coordinator declines and acknowledges', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if declining changes the reservation, removes the flag, or can be undone
    // Code: EquipmentSubstitutionsService.decline
    it('keeps the reservation, marks it DECLINED and leaves the flag with them', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);
      const sub = (await substitutionFor('galaMic'))!;

      await decide(sub.id, 'decline').expect(200);

      expect(
        (
          await prisma.equipmentReservation.findUniqueOrThrow({
            where: { id: ids.galaMic },
          })
        ).status,
      ).toBe(ReservationStatus.APPROVED);
      expect(
        (
          await prisma.eventRequest.findUniqueOrThrow({
            where: { id: ids.gala },
          })
        ).status,
      ).toBe(EventStatus.CONFIRMED);
      const flag = await flagFor('gala');
      expect(flag).toHaveLength(1);
      expect(flag[0].substitution).toMatchObject({ status: 'DECLINED' });
      expect(
        await prisma.notification.count({
          where: {
            recipientId: ids.tech,
            type: NotificationType.EQUIPMENT_SUBSTITUTE_DECIDED,
          },
        }),
      ).toBe(1);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if declining changes the reservation, removes the flag, or can be undone
    // Code: EquipmentSubstitutionsService.decline
    it('is the only answer to "no valid alternative": accepting is refused', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);
      const sub = (await substitutionFor('galaMic'))!;

      const res = await decide(sub.id, 'accept').expect(409);
      expect(res.body.message).toMatch(/nothing to accept/);

      await decide(sub.id, 'decline').expect(200);
      expect((await flagFor('gala'))[0].substitution.status).toBe('DECLINED');
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if declining changes the reservation, removes the flag, or can be undone
    // Code: EquipmentSubstitutionsService.decline
    it('is final: it cannot be accepted afterwards, nor re-suggested', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);
      const sub = (await substitutionFor('galaMic'))!;
      await decide(sub.id, 'decline').expect(200);

      await decide(sub.id, 'accept').expect(409);
      await decide(sub.id, 'decline').expect(409);
      await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ alternativeEquipmentId: ids.lapel })
        .expect(409);
    });
  });

  describe('only the event’s own Coordinator decides', () => {
    let substitutionId: string;

    beforeEach(async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);
      substitutionId = (await substitutionFor('galaMic'))!.id;
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if anyone but the event's own Coordinator can accept or decline
    // Code: EquipmentSubstitutionsService.accept / decline (assigned Coordinator only)
    it.each(['accept', 'decline'] as const)(
      '%s: another Coordinator gets 404',
      async (action) => {
        await decide(substitutionId, action, 'otherCoordinator').expect(404);
      },
    );

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if anyone but the event's own Coordinator can accept or decline
    // Code: EquipmentSubstitutionsService.accept / decline (assigned Coordinator only)
    it.each(['accept', 'decline'] as const)(
      '%s: other roles get 403',
      async (action) => {
        await decide(substitutionId, action, 'tech').expect(403);
        await decide(substitutionId, action, 'organiser').expect(403);
      },
    );

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if anyone but the event's own Coordinator can accept or decline
    // Code: EquipmentSubstitutionsService.accept / decline (assigned Coordinator only)
    it('needs a login', async () => {
      await http()
        .post(`/equipment-substitutions/${substitutionId}/accept`)
        .expect(401);
    });
  });

  describe('the item comes back into service', () => {
    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if a proposal or decline survives the item's return to service, so a later outage is not a fresh question
    // Code: EquipmentSubstitutionsService.voidForRestoredItem
    it('voids a waiting proposal, and a later outage asks again', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'Repaired.',
      }).expect(200);

      expect(
        (await prisma.equipmentSubstitution.findMany()).map((s) => s.status),
      ).toEqual([SubstitutionStatus.VOID]);
      expect(await flagFor('gala')).toEqual([]);

      await damage(ids.mic).expect(400);
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);
      expect(await substitutionFor('galaMic')).toMatchObject({
        status: SubstitutionStatus.PENDING,
      });
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup · fails if a proposal or decline survives the item's return to service, so a later outage is not a fresh question
    // Code: EquipmentSubstitutionsService.voidForRestoredItem
    it('closes a decline too, so the next outage is a fresh question', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);
      await decide((await substitutionFor('galaMic'))!.id, 'decline').expect(
        200,
      );

      await changeStatus(ids.mic, {
        status: EquipmentStatus.OPERATIONAL,
        reason: 'Repaired.',
      }).expect(200);

      await damage(ids.mic).expect(400);
    });
  });

  describe('an item that is already out of service', () => {
    beforeEach(async () => {
      // Out of service before the event reached CONFIRMED: no answer was needed.
      await given('tc-s4-110m-setup');
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110m-setup · fails if Technical Support cannot answer afterwards and tell the Coordinator, or can answer twice, for an event not confirmed, or for an item in service
    // Code: EquipmentSubstitutionsService.suggest -> EquipmentNotifier.substituteSuggested
    it('lets Technical Support answer afterwards, and tells the Coordinator', async () => {
      const res = await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ alternativeEquipmentId: ids.lapel })
        .expect(201);

      expect(res.body).toMatchObject({ status: 'PENDING' });
      expect(
        await prisma.notification.count({
          where: {
            recipientId: ids.coordinator,
            type: NotificationType.EQUIPMENT_SUBSTITUTE_SUGGESTED,
          },
        }),
      ).toBe(1);
    });

    // TC-S4-110 · US-67 AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110m-setup + tc-s4-110p-setup · fails if an answer is accepted for an unknown or released reservation, with both or neither choice, or naming an item that does not exist
    // Code: EquipmentSubstitutionsService.suggest (reservation or item not found 404; no longer active 409; substitutionPlanError 400)
    it('refuses answers that cannot stand: unknown or released reservation, an unknown item, both choices', async () => {
      const answer = (reservationId: string, body: object) =>
        http().post(`/equipment/reservations/${reservationId}/substitution`).set('Authorization', as('tech')).send(body);

      await answer('RSV-999', { noAlternative: true }).expect(404);
      await answer(ids.galaMic, { alternativeEquipmentId: 'EQP-999' }).expect(404);
      await answer(ids.galaMic, { alternativeEquipmentId: ids.lapel, noAlternative: true }).expect(400);
      await given('tc-s4-110p-setup'); // the reservation is released
      await answer(ids.galaMic, { noAlternative: true }).expect(409);

      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110m-setup · fails if Technical Support cannot answer afterwards and tell the Coordinator, or can answer twice, for an event not confirmed, or for an item in service
    // Code: EquipmentSubstitutionsService.suggest -> EquipmentNotifier.substituteSuggested
    it('409s a second answer for the same reservation', async () => {
      const post = () =>
        http()
          .post(`/equipment/reservations/${ids.galaMic}/substitution`)
          .set('Authorization', as('tech'))
          .send({ noAlternative: true });
      await post().expect(201);
      await post().expect(409);
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110m-setup + tc-s4-110n-setup · fails if Technical Support cannot answer afterwards and tell the Coordinator, or can answer twice, for an event not confirmed, or for an item in service
    // Code: EquipmentSubstitutionsService.suggest -> EquipmentNotifier.substituteSuggested
    it('409s when the event is not confirmed', async () => {
      await given('tc-s4-110n-setup'); // the gala is back in planning

      await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ noAlternative: true })
        .expect(409);
    });

    // TC-S4-107, TC-S4-110 · US-67 AC-1, AC-4 · setup: base-users + tc-s4-110-setup + tc-s4-110m-setup + tc-s4-110o-setup · fails if Technical Support cannot answer afterwards and tell the Coordinator, or can answer twice, for an event not confirmed, or for an item in service
    // Code: EquipmentSubstitutionsService.suggest -> EquipmentNotifier.substituteSuggested
    it('409s when the item is in service', async () => {
      await given('tc-s4-110o-setup'); // back in service

      await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ noAlternative: true })
        .expect(409);
    });
  });
});
