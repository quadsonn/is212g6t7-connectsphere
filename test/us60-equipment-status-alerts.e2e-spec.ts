import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquipmentStatus, NotificationType, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { listenOnLoopback } from './listen-on-loopback';

/**
 * US-60 e2e — Technical Support are alerted when a colleague marks an item
 * Damaged or Under Maintenance, through US-45's PATCH /equipment/:id/status.
 */
describe('US-60 Tech Support alerted when equipment is marked damaged/unavailable (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const PASSWORD = 'correct-horse-battery-staple';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const as = (who: string) => `Bearer ${tokens[who]}`;
  const http = () => request(app.getHttpServer());

  const seedUser = async (key: string, email: string, role: Role, name = key) => {
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(PASSWORD, 10), name, role },
    });
    ids[key] = user.id;
    const res = await http().post('/auth/login').send({ email, password: PASSWORD });
    tokens[key] = res.body.accessToken;
  };

  const markAs = (status: EquipmentStatus, who = 'wei', reason = 'Cracked lens') =>
    http()
      .patch(`/equipment/${ids.projector}/status`)
      .set('Authorization', as(who))
      .send({ status, reason });

  const noticesTo = (who: string) =>
    prisma.notification.findMany({
      where: { recipientId: ids[who], type: NotificationType.EQUIPMENT_STATUS_CHANGED },
    });

  /** Everything these tests create, children first. */
  const clear = async () => {
    await prisma.notification.deleteMany();
    await prisma.eventChange.deleteMany();
    await prisma.equipmentRequirement.deleteMany();
    await prisma.equipmentReservation.updateMany({ data: { replacedById: null } });
    await prisma.equipmentReservation.deleteMany();
    await prisma.equipment.deleteMany();
    await prisma.bookingDecision.deleteMany();
    await prisma.venueBooking.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.revokedToken.deleteMany();
    await prisma.eventRequest.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await listenOnLoopback(app);

    prisma = new PrismaClient();
  });

  afterAll(async () => {
    // Leave nothing behind for suites that delete users directly (status
    // changes and assignments reference users).
    await clear();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await clear();

    await seedUser('wei', 'wei@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Wei Technical');
    await seedUser('nadia', 'nadia@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Nadia Technical');
    await seedUser('omar', 'omar@example.com', Role.TECHNICAL_SUPPORT_STAFF, 'Omar Technical');
    await seedUser('coordinator', 'coordinator@example.com', Role.EVENT_COORDINATOR);

    ids.projector = (
      await prisma.equipment.create({ data: { type: 'Projector', totalQuantity: 4 } })
    ).id;
  });

  describe('AC-1: all other Technical Support staff are notified', () => {
    it('US-60 AC-1: marking an item Damaged notifies every other member with the item name and new status', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      for (const who of ['nadia', 'omar']) {
        const notices = await noticesTo(who);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
          message: 'Projector marked Damaged by Wei Technical. Reason: Cracked lens',
          relatedEquipmentId: ids.projector,
          relatedEventId: null,
          read: false,
        });
      }
    });

    it('US-60 AC-1: marking an item Under Maintenance notifies them too', async () => {
      await markAs(EquipmentStatus.UNDER_MAINTENANCE, 'wei', 'Annual service').expect(200);

      const [notice] = await noticesTo('nadia');
      expect(notice.message).toBe('Projector marked Under Maintenance by Wei Technical. Reason: Annual service');
    });

    it('US-60 AC-1: the notice links each recipient to the item in their inbox', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      const { body } = await http().get('/notifications').set('Authorization', as('nadia')).expect(200);

      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        type: NotificationType.EQUIPMENT_STATUS_CHANGED,
        summary: 'Projector marked Damaged by Wei Technical.',
        reason: 'Cracked lens',
        link: `/equipment/inventory/${ids.projector}`,
      });
    });

    it('US-60 AC-1: whoever makes the change is the one left out', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE, 'nadia').expect(200);

      expect(await noticesTo('nadia')).toHaveLength(0);
      expect(await noticesTo('wei')).toHaveLength(1);
      expect(await noticesTo('omar')).toHaveLength(1);
    });
  });

  describe('AC-2: the acting member is not notified', () => {
    it('US-60 AC-2: the actor isn’t notified', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.wei } })).toBe(0);
    });
  });

  describe('AC-3: inventory-wide, regardless of event assignment', () => {
    it('US-60 AC-3: works with no events or assignments at all', async () => {
      expect(await prisma.eventRequest.count()).toBe(0);

      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await noticesTo('nadia')).toHaveLength(1);
      expect(await noticesTo('omar')).toHaveLength(1);
    });

    it('US-60 AC-3: only Technical Support hear about it — Coordinators are US-67’s', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);

      expect(await prisma.notification.count({ where: { recipientId: ids.coordinator } })).toBe(0);
    });
  });

  describe('what is not announced', () => {
    it('US-60: an item returning to Available tells no one', async () => {
      await prisma.equipment.update({
        where: { id: ids.projector },
        data: { operationalStatus: EquipmentStatus.OUT_OF_SERVICE },
      });

      await markAs(EquipmentStatus.OPERATIONAL, 'wei', 'Repaired').expect(200);

      expect(await prisma.notification.count()).toBe(0);
    });

    it('US-60: a refused change (already that status) tells no one', async () => {
      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(200);
      await prisma.notification.deleteMany();

      await markAs(EquipmentStatus.OUT_OF_SERVICE).expect(409);

      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
