import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentStatus, NotificationType, PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { loadSql } from './helpers/load-sql';
import { resetDb } from './helpers/reset-db';

/**
 * US-60 e2e — Technical Support are alerted when a colleague marks an item
 * Damaged or Under Maintenance, through US-45's PATCH /equipment/:id/status.
 *
 * Code under test: EquipmentService.changeStatus -> EquipmentStatusNotifier
 * (every other TECHNICAL_SUPPORT_STAFF, EQUIPMENT_STATUS_CHANGED).
 *
 * Pre-condition for every test: reset the testDB, then run base-users.sql and
 * tc-s4-73-setup.sql (Wei, Nadia and Omar of Technical Support, and a
 * Projector, EQP-023). Base-users adds a fourth member, Toby Tech.
 */
describe('US-60 Tech Support alerted when equipment is marked damaged/unavailable (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  /** Fixed rows from base-users and tc-s4-73-setup. */
  const ids: Record<string, string> = {
    wei: 'USR-035',
    nadia: 'USR-036',
    omar: 'USR-037',
    coordinator: 'USR-004',
    projector: 'EQP-023',
  };
  const LOGINS: Record<string, string> = {
    wei: 'wei@example.com',
    nadia: 'nadia@example.com',
    omar: 'omar@example.com',
  };

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());
  const given = async (...scripts: string[]) => {
    for (const script of scripts) await loadSql(prisma, script);
  };

  /**
   * US-45: status is by quantity. These tests move the whole item (all 4
   * projectors) — out of use, or back from Damaged to Available.
   */
  const markAs = (status: EquipmentStatus, who = 'wei', reason = 'Cracked lens') =>
    http()
      .patch(`/equipment/${ids.projector}/status`)
      .set('Authorization', as(who))
      .send({
        from: status === EquipmentStatus.OPERATIONAL ? EquipmentStatus.OUT_OF_SERVICE : EquipmentStatus.OPERATIONAL,
        to: status,
        quantity: 4,
        reason,
      });

  const noticesTo = (who: string) =>
    prisma.notification.findMany({
      where: { recipientId: ids[who], type: NotificationType.EQUIPMENT_STATUS_CHANGED },
    });

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
    await given('base-users', 'tc-s4-73-setup');
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
    await resetDb(prisma);
    await given('base-users', 'tc-s4-73-setup');
  });

  describe('AC-1: all other Technical Support staff are notified', () => {
    // TC-S4-73 · US-60 AC-1 · setup: base-users + tc-s4-73-setup · fails if any other Technical Support member is not told, or the notice lacks the item name, the new status or the link to the item
    // Code: EquipmentService.changeStatus -> EquipmentStatusNotifier.statusChanged (EQUIPMENT_STATUS_CHANGED, relatedEquipmentId)
    it('US-60 AC-1: marking an item Damaged notifies every other member with the item name and new status', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      for (const who of ['nadia', 'omar']) {
        const notices = await noticesTo(who);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
          message: '4 of 4 Projector marked Damaged by Wei Technical. Reason: Cracked lens',
          relatedEquipmentId: ids.projector,
          relatedEventId: null,
          read: false,
        });
      }
    });

    // TC-S4-73 · US-60 AC-1 · setup: base-users + tc-s4-73-setup · fails if any other Technical Support member is not told, or the notice lacks the item name, the new status or the link to the item
    // Code: EquipmentService.changeStatus -> EquipmentStatusNotifier.statusChanged (EQUIPMENT_STATUS_CHANGED, relatedEquipmentId)
    it('US-60 AC-1: marking an item Under Maintenance notifies them too', async () => {
      await markAs(EquipmentStatus.UNDER_MAINTENANCE, 'wei', 'Annual service').expect(200);

      const [notice] = await noticesTo('nadia');
      expect(notice.message).toBe('4 of 4 Projector marked Under Maintenance by Wei Technical. Reason: Annual service');
    });

    // TC-S4-73 · US-60 AC-1 · setup: base-users + tc-s4-73-setup · fails if any other Technical Support member is not told, or the notice lacks the item name, the new status or the link to the item
    // Code: EquipmentService.changeStatus -> EquipmentStatusNotifier.statusChanged (EQUIPMENT_STATUS_CHANGED, relatedEquipmentId)
    it('US-60 AC-1: the notice links each recipient to the item in their inbox', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      const { body } = await http().get('/notifications').set('Authorization', as('nadia')).expect(200);

      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        type: NotificationType.EQUIPMENT_STATUS_CHANGED,
        summary: '4 of 4 Projector marked Damaged by Wei Technical.',
        reason: 'Cracked lens',
        link: `/equipment/inventory/${ids.projector}`,
      });
    });

    // TC-S4-73, TC-S4-74 · US-60 AC-1/AC-2 · setup: base-users + tc-s4-73-setup · fails if a member who did not make the change is left out, or the one who did is notified
    // Code: EquipmentStatusNotifier.statusChanged (every other TECHNICAL_SUPPORT_STAFF)
    it('US-60 AC-1: whoever makes the change is the one left out', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE, 'nadia').expect(200);

      expect(await noticesTo('nadia')).toHaveLength(0);
      expect(await noticesTo('wei')).toHaveLength(1);
      expect(await noticesTo('omar')).toHaveLength(1);
    });
  });

  describe('AC-2: the acting member is not notified', () => {
    // TC-S4-74 · US-60 AC-2 · setup: base-users + tc-s4-73-setup · fails if the member who made the change is notified
    // Code: EquipmentStatusNotifier.statusChanged (actor excluded)
    it('US-60 AC-2: the actor isn’t notified', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.wei } })).toBe(0);
    });
  });

  describe('AC-3: inventory-wide, regardless of event assignment', () => {
    // TC-S4-75 · US-60 AC-3 · setup: base-users + tc-s4-73-setup · fails if the alert depends on events or assignments, or reaches anyone but Technical Support
    // Code: EquipmentStatusNotifier.statusChanged (all of the role, no event filter)
    it('US-60 AC-3: works with no events or assignments at all', async () => {
      expect(await prisma.eventRequest.count()).toBe(0);

      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await noticesTo('nadia')).toHaveLength(1);
      expect(await noticesTo('omar')).toHaveLength(1);
    });

    // TC-S4-75 · US-60 AC-3 · setup: base-users + tc-s4-73-setup · fails if the alert depends on events or assignments, or reaches anyone but Technical Support
    // Code: EquipmentStatusNotifier.statusChanged (all of the role, no event filter)
    it('US-60 AC-3: only Technical Support hear about it — Coordinators are US-67’s', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.coordinator } })).toBe(0);
    });
  });

  describe('what is not announced', () => {
    // TC-S4-73 · US-60 AC-1 · setup: base-users + tc-s4-73-setup + tc-s4-73b-setup · fails if an item returning to Available, or a refused change, notifies anyone
    // Code: EquipmentStatusNotifier (only OUT_OF_SERVICE / UNDER_MAINTENANCE, after commit)
    it('US-60: an item returning to Available tells no one', async () => {
      await given('tc-s4-73b-setup'); // already marked Damaged

      await markAs(EquipmentStatus.OPERATIONAL, 'wei', 'Repaired').expect(200);

      expect(await prisma.notification.count()).toBe(0);
    });

    // TC-S4-73 · US-60 AC-1 · setup: base-users + tc-s4-73-setup · fails if an item returning to Available, or a refused change, notifies anyone
    // Code: EquipmentStatusNotifier (only OUT_OF_SERVICE / UNDER_MAINTENANCE, after commit)
    it('US-60: a refused change (no working units left to mark) tells no one', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);
      // Kept by design: clears the first change's notices, so only the refused one is counted.
      await prisma.notification.deleteMany();

      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
