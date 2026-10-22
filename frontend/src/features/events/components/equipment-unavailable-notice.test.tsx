import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { UnavailableEquipment } from '@/types/api';
import { EquipmentUnavailableNotice } from './equipment-unavailable-notice';

const item = (overrides: Partial<UnavailableEquipment> = {}): UnavailableEquipment => ({
  reservationId: 'RSV-1',
  equipmentId: 'EQP-1',
  equipmentType: 'Laser projector',
  equipmentStatus: 'OUT_OF_SERVICE',
  reservationStatus: 'APPROVED',
  quantity: 2,
  start: '2030-11-01T09:00:00Z',
  end: '2030-11-01T17:00:00Z',
  ...overrides,
});

describe('EquipmentUnavailableNotice', () => {
  it('renders nothing when there is nothing to flag', () => {
    const { container } = render(<EquipmentUnavailableNotice items={[]} />);
    expect(container).toBeEmptyDOMElement();

    const { container: none } = render(<EquipmentUnavailableNotice items={undefined} />);
    expect(none).toBeEmptyDOMElement();
  });

  it('flags each affected item with its status, as an alert', () => {
    render(
      <EquipmentUnavailableNotice
        items={[
          item(),
          item({
            reservationId: 'RSV-2',
            equipmentType: 'Wireless microphone',
            equipmentStatus: 'UNDER_MAINTENANCE',
            reservationStatus: 'REQUESTED',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/2 × Laser projector/)).toBeInTheDocument();
    expect(screen.getByText(/damaged · reserved/)).toBeInTheDocument();
    expect(screen.getByText(/2 × Wireless microphone/)).toBeInTheDocument();
    expect(screen.getByText(/under maintenance · requested/)).toBeInTheDocument();
  });
});
