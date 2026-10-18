import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import type { RegistrationOptionsView } from '@/types/api';
import { useRegistrationOptions } from '../hooks/use-registrations';

/** The sentence explaining why Register is unavailable, with the times shown. */
function blockedMessage(options: RegistrationOptionsView): string {
  const opens = options.opensAt ? formatDateTime(options.opensAt) : null;
  const closes = options.closesAt ? formatDateTime(options.closesAt) : null;

  switch (options.block) {
    case 'NOT_YET_OPEN':
      return `Registration opens ${opens ?? 'later'}${closes ? ` and closes ${closes}` : ''}.`;
    case 'CLOSED':
      return `Registration closed ${closes ?? 'already'}${opens ? ` (it opened ${opens})` : ''}.`;
    case 'FULL':
      return options.capacity !== null
        ? `This event is full — all ${options.capacity} places are taken.`
        : 'This event is full.';
    default:
      return options.reason ?? 'Registration is not available for this event.';
  }
}

/**
 * US-34 — the Register button for one event. Disabled, with the reason and the
 * open/close times beside it, when registration is closed, not yet open or
 * full. This only decides what is offered: the server re-checks every rule when
 * the form is submitted, so a stale answer here is refused, not honoured.
 */
export function RegisterAction({
  eventId,
  onRegister,
}: {
  eventId: string;
  onRegister: () => void;
}) {
  const { data: options, isPending, isError } = useRegistrationOptions(eventId);

  if (isPending) {
    return (
      <Button size="sm" className="shrink-0" disabled>
        Register
      </Button>
    );
  }

  // If the check itself fails, offer Register anyway; the server decides.
  if (isError || options.canRegister) {
    return (
      <Button size="sm" className="shrink-0" onClick={onRegister}>
        Register
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
      <Button size="sm" disabled aria-describedby={`register-reason-${eventId}`}>
        Register
      </Button>
      <p id={`register-reason-${eventId}`} className="max-w-xs text-xs text-ink-600">
        {blockedMessage(options)}
      </p>
    </div>
  );
}
