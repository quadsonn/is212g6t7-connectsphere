import { describe, expect, it } from 'vitest';

import type { OrganiserRequestView } from '@/types/api';
import { EMPTY_EVENT_REQUEST_FORM, mapExistingToForm, toPayload } from './event-request-form';

describe('US-20 AC-3: required facilities on the event request form', () => {
  it('Given facilities are picked, Then the payload sends them', () => {
    const payload = toPayload({ ...EMPTY_EVENT_REQUEST_FORM, requiredFacilities: ['PROJECTOR', 'STAGE'] });

    expect(payload.requiredFacilities).toEqual(['PROJECTOR', 'STAGE']);
  });

  it('Given none are picked, Then the payload sends an empty list', () => {
    expect(toPayload(EMPTY_EVENT_REQUEST_FORM).requiredFacilities).toEqual([]);
  });

  it('Given a stored request, Then the form is prefilled with its facilities', () => {
    const form = mapExistingToForm({
      accessibilityRequirements: [],
      requiredFacilities: ['MICROPHONE'],
      registrationEnabled: false,
    } as unknown as OrganiserRequestView);

    expect(form.requiredFacilities).toEqual(['MICROPHONE']);
  });

  it('Given a request saved before the field existed, Then the form starts with none', () => {
    const form = mapExistingToForm({
      accessibilityRequirements: [],
      registrationEnabled: false,
    } as unknown as OrganiserRequestView);

    expect(form.requiredFacilities).toEqual([]);
  });
});
