import { apiErrorMessage } from '@/lib/api-client';
import type { EquipmentRequirement } from '@/types/api';
import { useManualCheck } from '../hooks/use-events';

/**
 * US-42 — a free-text equipment line names no catalogue item, so nothing can
 * be reserved against it. The assigned Coordinator ticks it once they have
 * checked it by hand; the confirmation checklist refetches after each tick.
 */
export function ManualCheckToggle({
  eventId,
  requirement,
}: {
  eventId: string;
  requirement: EquipmentRequirement;
}) {
  const check = useManualCheck(eventId);
  const checked = Boolean(requirement.manuallyConfirmedAt);
  const id = `manual-check-${requirement.id}`;

  return (
    <div>
      <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-ink-700">
        <input
          id={id}
          type="checkbox"
          className="size-4 rounded border-ink-300 text-brand-600 focus:outline-2 focus:outline-offset-2 focus:outline-brand-600"
          checked={checked}
          disabled={check.isPending}
          aria-label={`${requirement.equipmentType} checked by hand`}
          onChange={(e) =>
            check.mutate({ requirementId: requirement.id, checked: e.target.checked })
          }
        />
        Checked
      </label>
      {check.error ? (
        <p className="mt-1 text-xs text-red-700">
          {apiErrorMessage(check.error, 'Could not save the check.')}
        </p>
      ) : null}
    </div>
  );
}
