import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  EquipmentStatus,
  EventStatus,
  NotificationType,
  PrismaClient,
  ReservationStatus,
  Role,
  SubstitutionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * Equipment substitutions e2e. When Technical Support takes an item out of
 * use and it is reserved for a CONFIRMED event, they must suggest a
 * replacement (or say there is none); earlier-stage events need nothing. The
 * event's Coordinator accepts, or declines and acknowledges. One describe per
 * rule so a failing test names the rule it breaks.
 */
describe('Equipment substitutions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

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

  const seedUser = async (key: string, email: string, role: Role) => {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        name: key,
        role,
      },
    });
    const res = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
    ids[key] = user.id;
  };

  const seedEquipment = async (
    key: string,
    type: string,
    totalQuantity: number,
  ) => {
    ids[key] = (
      await prisma.equipment.create({
        data: { type, totalQuantity, location: 'AV Store' },
      })
    ).id;
  };

  const seedEvent = async (
    key: string,
    status: EventStatus,
    coordinator = 'coordinator',
  ) => {
    ids[key] = (
      await prisma.eventRequest.create({
        data: {
          organiserId: ids.organiser,
          coordinatorId: ids[coordinator],
          name: key,
          purpose: 'Purpose',
          description: 'Description',
          category: 'Conference',
          proposedStart: new Date(START),
          proposedEnd: new Date(END),
          expectedAttendance: 100,
          equipmentNeeds: 'Microphones.',
          status,
        },
      })
    ).id;
  };

  const seedReservation = async (
    key: string,
    eventKey: string,
    equipmentKey: string,
    quantity: number,
    status: ReservationStatus = ReservationStatus.APPROVED,
  ) => {
    ids[key] = (
      await prisma.equipmentReservation.create({
        data: {
          eventId: ids[eventKey],
          equipmentId: ids[equipmentKey],
          quantity,
          start: new Date(START),
          end: new Date(END),
          status,
        },
      })
    ).id;
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

  const clear = async () => {
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('tech', 'tech@example.com', Role.TECHNICAL_SUPPORT_STAFF);
    await seedUser(
      'coordinator',
      'coordinator@example.com',
      Role.EVENT_COORDINATOR,
    );
    await seedUser(
      'otherCoordinator',
      'other@example.com',
      Role.EVENT_COORDINATOR,
    );
    await seedUser('organiser', 'organiser@example.com', Role.EVENT_ORGANISER);

    await seedEquipment('mic', 'Wireless microphone', 10);
    await seedEquipment('lapel', 'Lapel microphone', 10);
    await seedEvent('gala', EventStatus.CONFIRMED);
    await seedReservation('galaMic', 'gala', 'mic', 2);
  });

  describe('a confirmed event needs an answer before the item is taken out of use', () => {
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

    it('accepts "no valid alternative" as an answer', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, noAlternative: true },
      ]).expect(200);

      expect(await substitutionFor('galaMic')).toMatchObject({
        status: SubstitutionStatus.PENDING,
        alternativeEquipmentId: null,
      });
    });

    it('also requires one for a merely requested reservation on a confirmed event', async () => {
      await prisma.equipmentReservation.update({
        where: { id: ids.galaMic },
        data: { status: ReservationStatus.REQUESTED },
      });

      await damage(ids.mic).expect(400);
    });

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

  describe('a finished event is left alone', () => {
    it.each([
      EventStatus.COMPLETED,
      EventStatus.CANCELLED,
      EventStatus.REJECTED,
    ])(
      'a %s event gets no notice, no flag and needs no replacement',
      async (status) => {
        await prisma.eventRequest.update({
          where: { id: ids.gala },
          data: { status },
        });

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

    it('still warns about, and notifies, a live event using the same item', async () => {
      await prisma.eventRequest.update({
        where: { id: ids.gala },
        data: { status: EventStatus.COMPLETED },
      });
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
    it('marks the item unavailable without one, as before', async () => {
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);
      await prisma.equipmentReservation.delete({ where: { id: ids.galaMic } });

      const res = await damage(ids.mic).expect(200);

      expect(res.body.affectedReservations).toHaveLength(1);
      expect(await prisma.equipmentSubstitution.count()).toBe(0);
    });

    it('requires an answer only for the confirmed one when both are affected', async () => {
      await seedEvent('retreat', EventStatus.PLANNING);
      await seedReservation('retreatMic', 'retreat', 'mic', 3);

      await damage(ids.mic).expect(400);
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(200);

      expect(await prisma.equipmentSubstitution.count()).toBe(1);
    });

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

    it('409s when the alternative is itself out of service', async () => {
      await prisma.equipment.update({
        where: { id: ids.lapel },
        data: { operationalStatus: EquipmentStatus.UNDER_MAINTENANCE },
      });

      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.lapel },
      ]).expect(409);
    });

    it('400s when an item is offered as its own replacement', async () => {
      await damage(ids.mic, [
        { reservationId: ids.galaMic, alternativeEquipmentId: ids.mic },
      ]).expect(400);
    });

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
    it('lists items with the full quantity free, same type first, never the item itself', async () => {
      await seedEquipment('wireless2', 'wireless microphone', 5);
      await seedEquipment('scarce', 'Handheld microphone', 1);
      await seedEquipment('broken', 'Boundary microphone', 10);
      await prisma.equipment.update({
        where: { id: ids.broken },
        data: { operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
      });

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

    it('is closed to the Coordinator', async () => {
      await http()
        .get(`/equipment/reservations/${ids.galaMic}/alternatives`)
        .set('Authorization', as('coordinator'))
        .expect(403);
    });
  });

  describe('the Coordinator is told, and sees the proposal on the flag', () => {
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

    it('repoints the matching required-equipment line at the alternative', async () => {
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

    it('splits a larger line, moving only the swapped quantity to the alternative', async () => {
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

    it('leaves the event ready to confirm: the new line counts as reserved', async () => {
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

    it('cannot be decided twice', async () => {
      const sub = (await substitutionFor('galaMic'))!;
      await decide(sub.id, 'accept').expect(200);

      await decide(sub.id, 'accept').expect(409);
      await decide(sub.id, 'decline').expect(409);
    });

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

    it('409s when the alternative has since gone out of service', async () => {
      await prisma.equipment.update({
        where: { id: ids.lapel },
        data: { operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
      });
      const sub = (await substitutionFor('galaMic'))!;

      const res = await decide(sub.id, 'accept').expect(409);
      expect(res.body.message).toMatch(/no longer in service/);
    });

    it('409s when the event is no longer confirmed', async () => {
      await prisma.eventRequest.update({
        where: { id: ids.gala },
        data: { status: EventStatus.PLANNING },
      });
      const sub = (await substitutionFor('galaMic'))!;

      await decide(sub.id, 'accept').expect(409);
    });
  });

  describe('the Coordinator declines and acknowledges', () => {
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

    it.each(['accept', 'decline'] as const)(
      '%s: another Coordinator gets 404',
      async (action) => {
        await decide(substitutionId, action, 'otherCoordinator').expect(404);
      },
    );

    it.each(['accept', 'decline'] as const)(
      '%s: other roles get 403',
      async (action) => {
        await decide(substitutionId, action, 'tech').expect(403);
        await decide(substitutionId, action, 'organiser').expect(403);
      },
    );

    it('needs a login', async () => {
      await http()
        .post(`/equipment-substitutions/${substitutionId}/accept`)
        .expect(401);
    });
  });

  describe('the item comes back into service', () => {
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
      await prisma.equipment.update({
        where: { id: ids.mic },
        data: { operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
      });
    });

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

    it('409s a second answer for the same reservation', async () => {
      const post = () =>
        http()
          .post(`/equipment/reservations/${ids.galaMic}/substitution`)
          .set('Authorization', as('tech'))
          .send({ noAlternative: true });
      await post().expect(201);
      await post().expect(409);
    });

    it('409s when the event is not confirmed', async () => {
      await prisma.eventRequest.update({
        where: { id: ids.gala },
        data: { status: EventStatus.PLANNING },
      });

      await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ noAlternative: true })
        .expect(409);
    });

    it('409s when the item is in service', async () => {
      await prisma.equipment.update({
        where: { id: ids.mic },
        data: { operationalStatus: EquipmentStatus.OPERATIONAL },
      });

      await http()
        .post(`/equipment/reservations/${ids.galaMic}/substitution`)
        .set('Authorization', as('tech'))
        .send({ noAlternative: true })
        .expect(409);
    });
  });
});
