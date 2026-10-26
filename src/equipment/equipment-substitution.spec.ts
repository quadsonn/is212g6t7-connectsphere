import { EventStatus, SubstitutionStatus } from '@prisma/client';

import {
  acceptError,
  AffectedReservation,
  requiresSubstitution,
  substitutionDecisionError,
  substitutionPlanError,
} from './equipment-substitution';

const reservation = (id: string, status: EventStatus): AffectedReservation => ({
  id,
  quantity: 2,
  start: new Date('2030-10-01T09:00:00Z'),
  end: new Date('2030-10-01T17:00:00Z'),
  event: { status },
});

describe('requiresSubstitution', () => {
  it('is true only once the event is CONFIRMED', () => {
    for (const status of Object.values(EventStatus)) {
      expect(requiresSubstitution(status)).toBe(
        status === EventStatus.CONFIRMED,
      );
    }
  });
});

describe('substitutionPlanError', () => {
  const confirmed = reservation('RSV-1', EventStatus.CONFIRMED);
  const planning = reservation('RSV-2', EventStatus.PLANNING);

  it('needs nothing when no affected reservation is on a confirmed event', () => {
    expect(substitutionPlanError([planning], [])).toBeNull();
    expect(substitutionPlanError([], [])).toBeNull();
  });

  it('needs an answer for every confirmed reservation', () => {
    expect(substitutionPlanError([confirmed], [])).toMatch(/RSV-1/);
    expect(
      substitutionPlanError(
        [confirmed, reservation('RSV-3', EventStatus.CONFIRMED)],
        [{ reservationId: 'RSV-1', noAlternative: true }],
      ),
    ).toMatch(/RSV-3/);
  });

  it('accepts a replacement or "no valid alternative" for each', () => {
    expect(
      substitutionPlanError(
        [confirmed],
        [{ reservationId: 'RSV-1', alternativeEquipmentId: 'EQP-2' }],
      ),
    ).toBeNull();
    expect(
      substitutionPlanError(
        [confirmed],
        [{ reservationId: 'RSV-1', noAlternative: true }],
      ),
    ).toBeNull();
  });

  it('asks for the earlier-stage reservation nothing, and refuses an answer for it', () => {
    expect(
      substitutionPlanError(
        [confirmed, planning],
        [{ reservationId: 'RSV-1', noAlternative: true }],
      ),
    ).toBeNull();
    expect(
      substitutionPlanError(
        [confirmed, planning],
        [
          { reservationId: 'RSV-1', noAlternative: true },
          { reservationId: 'RSV-2', noAlternative: true },
        ],
      ),
    ).toMatch(/RSV-2/);
  });

  it('refuses an answer for a reservation that is not affected at all', () => {
    expect(
      substitutionPlanError(
        [confirmed],
        [
          { reservationId: 'RSV-1', noAlternative: true },
          { reservationId: 'RSV-9', noAlternative: true },
        ],
      ),
    ).toMatch(/RSV-9/);
  });

  it('refuses both an item and "no alternative", and neither', () => {
    expect(
      substitutionPlanError(
        [confirmed],
        [
          {
            reservationId: 'RSV-1',
            alternativeEquipmentId: 'EQP-2',
            noAlternative: true,
          },
        ],
      ),
    ).toMatch(/not both, not neither/);
    expect(
      substitutionPlanError([confirmed], [{ reservationId: 'RSV-1' }]),
    ).toMatch(/not both, not neither/);
  });

  it('treats noAlternative: false as no answer', () => {
    expect(
      substitutionPlanError(
        [confirmed],
        [{ reservationId: 'RSV-1', noAlternative: false }],
      ),
    ).toMatch(/not both, not neither/);
  });

  it('refuses two answers for one reservation', () => {
    expect(
      substitutionPlanError(
        [confirmed],
        [
          { reservationId: 'RSV-1', noAlternative: true },
          { reservationId: 'RSV-1', alternativeEquipmentId: 'EQP-2' },
        ],
      ),
    ).toMatch(/more than one/);
  });
});

describe('substitutionDecisionError', () => {
  it('lets a PENDING one be accepted or declined', () => {
    expect(
      substitutionDecisionError(SubstitutionStatus.PENDING, 'accept'),
    ).toBeNull();
    expect(
      substitutionDecisionError(SubstitutionStatus.PENDING, 'decline'),
    ).toBeNull();
  });

  it('refuses everything once decided, and says a decline is final', () => {
    expect(
      substitutionDecisionError(SubstitutionStatus.ACCEPTED, 'decline'),
    ).toMatch(/accepted/);
    expect(
      substitutionDecisionError(SubstitutionStatus.DECLINED, 'accept'),
    ).toMatch(/final/);
    expect(
      substitutionDecisionError(SubstitutionStatus.DECLINED, 'decline'),
    ).toMatch(/declined/);
  });

  it('refuses a closed one: the item is back in service', () => {
    expect(
      substitutionDecisionError(SubstitutionStatus.VOID, 'accept'),
    ).toMatch(/back in service/);
  });
});

describe('acceptError', () => {
  it('has nothing to accept when there is no valid alternative', () => {
    expect(acceptError(null)).toMatch(/nothing to accept/);
    expect(acceptError('EQP-2')).toBeNull();
  });
});
