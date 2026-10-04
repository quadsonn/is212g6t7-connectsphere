import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';

import { ErrorState, LoadingState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  type SuitabilityCheckStatus,
  type VenueSuitability,
} from '@/types/api';
import { useVenueSuitability } from '../hooks/use-venues';

const OVERALL: Record<
  VenueSuitability['overall'],
  { title: string; body: string; icon: LucideIcon; className: string }
> = {
  SUITABLE: {
    title: 'Appears suitable',
    body: 'This venue meets every requirement that could be checked.',
    icon: CircleCheck,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  NOT_SUITABLE: {
    title: 'May not be suitable',
    body: 'Some requirements are not met. You can still request this venue.',
    icon: AlertTriangle,
    className: 'border-amber-300 bg-amber-50 text-amber-900',
  },
  INCOMPLETE: {
    title: 'Could not fully check',
    body: 'The event is missing information needed for some checks.',
    icon: CircleHelp,
    className: 'border-ink-200 bg-ink-50 text-ink-800',
  },
};

const NOT_CHECKED_LABEL = { facilities: 'Facilities', equipment: 'Equipment' } as const;

/**
 * US-20 — advisory suitability checklist for one venue against one event.
 *
 * Informational only (AC-5): it renders flags and nothing else. It has no
 * say over the "Request this venue" action, which must stay usable whatever
 * this panel reports.
 */
export function VenueSuitabilityPanel({ venueId, eventId }: { venueId: string; eventId: string }) {
  const { data, isPending, isError, error } = useVenueSuitability(venueId, eventId);

  if (isPending) return <LoadingState label="Checking suitability…" />;
  if (isError) {
    return <ErrorState message={apiErrorMessage(error, 'Could not check suitability.')} />;
  }

  const overall = OVERALL[data.overall];
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-4">
      {/* AC-4: a positive, explicit verdict — not an absence of warnings. */}
      <div
        role="status"
        className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', overall.className)}
      >
        <OverallIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{overall.title}</p>
          <p className="text-sm">{overall.body}</p>
        </div>
      </div>

      <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
        <CheckRow
          label="Capacity"
          status={data.capacity.status}
          detail={capacityDetail(data.capacity)}
        />

        <CheckRow
          label="Accessibility"
          status={data.accessibility.status}
          detail={
            data.accessibility.status === 'NOT_REQUIRED'
              ? 'The event records no accessibility requirements.'
              : undefined
          }
        >
          {/* AC-2: one line per requirement, so the missing one is named. */}
          {data.accessibility.items.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {data.accessibility.items.map((item) => (
                <li key={item.requirement}>
                  <ItemLine met={item.met} label={ACCESSIBILITY_FEATURE_LABELS[item.requirement]} />
                </li>
              ))}
            </ul>
          ) : null}
        </CheckRow>

        <CheckRow
          label="Layout"
          status={data.layout.status}
          detail={
            data.layout.requirement === null
              ? 'The event has no preferred layout.'
              : data.layout.status === 'MET'
                ? `Supports ${humanise(data.layout.requirement)}.`
                : `Does not list ${humanise(data.layout.requirement)} as a supported layout.`
          }
        />
      </ul>

      {/* Checks that did not run are named, never shown as passing. */}
      {data.notChecked.length > 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-700">
            <CircleDashed className="size-4" aria-hidden="true" />
            Not checked yet
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-ink-600">
            {data.notChecked.map((item) => (
              <li key={item.check}>
                <span className="font-medium">{NOT_CHECKED_LABEL[item.check]}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function capacityDetail({ status, venueCapacity, expectedAttendance }: VenueSuitability['capacity']) {
  if (venueCapacity === null) return 'The venue has no recorded capacity, so it cannot be confirmed.';
  if (status === 'NOT_RECORDED') return `Seats ${venueCapacity}; the event has no expected attendance yet.`;
  return status === 'MET'
    ? `Seats ${venueCapacity}; ${expectedAttendance} expected.`
    : `Seats ${venueCapacity}, but ${expectedAttendance} are expected.`;
}

const STATUS_STYLE: Record<SuitabilityCheckStatus, { icon: LucideIcon; label: string; className: string }> = {
  MET: { icon: CircleCheck, label: 'Met', className: 'text-emerald-700' },
  UNMET: { icon: AlertTriangle, label: 'Not met', className: 'text-amber-700' },
  NOT_REQUIRED: { icon: CircleCheck, label: 'Nothing required', className: 'text-ink-500' },
  NOT_RECORDED: { icon: CircleHelp, label: 'Not recorded', className: 'text-ink-500' },
};

function CheckRow({
  label,
  status,
  detail,
  children,
}: {
  label: string;
  status: SuitabilityCheckStatus;
  detail?: string;
  children?: React.ReactNode;
}) {
  const style = STATUS_STYLE[status];
  const Icon = style.icon;

  return (
    <li className={cn('px-4 py-3', status === 'UNMET' && 'bg-amber-50/60')}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium', style.className)}>
          <Icon className="size-4" aria-hidden="true" />
          {style.label}
        </span>
      </div>
      {detail ? <p className="mt-1 text-sm text-ink-600">{detail}</p> : null}
      {children}
    </li>
  );
}

function ItemLine({ met, label }: { met: boolean; label: string }) {
  const Icon = met ? CircleCheck : AlertTriangle;
  return (
    <span className={cn('flex items-center gap-2 text-sm', met ? 'text-ink-700' : 'font-medium text-amber-800')}>
      <Icon className={cn('size-4', met ? 'text-emerald-600' : 'text-amber-600')} aria-hidden="true" />
      {label}
      <span className="sr-only">{met ? ': met' : ': not met'}</span>
    </span>
  );
}
