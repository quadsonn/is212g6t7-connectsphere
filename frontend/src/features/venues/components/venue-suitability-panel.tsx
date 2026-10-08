import { AlertTriangle, Check, Info } from 'lucide-react';

import { ErrorState, LoadingState } from '@/components/ui/states';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  type SuitabilityCheckStatus,
  type VenueSuitability,
} from '@/types/api';
import { useVenueSuitability } from '../hooks/use-venues';

const VERDICT: Record<VenueSuitability['overall'], { label: string; className: string }> = {
  SUITABLE: { label: 'Appears suitable', className: 'text-emerald-700' },
  NOT_SUITABLE: { label: 'May not be suitable', className: 'text-amber-700' },
  INCOMPLETE: { label: 'Could not fully check', className: 'text-ink-600' },
};

/**
 * US-20 — advisory suitability checklist for one venue against one event.
 *
 * One row per check; detail text appears only where something needs
 * attention. Informational only (AC-5): it has no say over requesting the
 * venue.
 */
export function VenueSuitabilityPanel({ venueId, eventId }: { venueId: string; eventId: string }) {
  const { data, isPending, isError, error } = useVenueSuitability(venueId, eventId);

  if (isPending) return <LoadingState label="Checking suitability…" />;
  if (isError) {
    return <ErrorState message={apiErrorMessage(error, 'Could not check suitability.')} />;
  }

  const verdict = VERDICT[data.overall];
  const missing = data.accessibility.items.filter((item) => !item.met);

  return (
    <div>
      {/* AC-4: an explicit verdict, never just an absence of warnings. */}
      <p role="status" className={cn('mb-3 flex items-center gap-2 text-sm font-semibold', verdict.className)}>
        <StatusIcon status={data.overall === 'SUITABLE' ? 'MET' : data.overall === 'NOT_SUITABLE' ? 'UNMET' : 'NOT_RECORDED'} />
        {verdict.label}
      </p>

      <dl className="divide-y divide-ink-100 text-sm">
        <Row label="Capacity" status={data.capacity.status}>
          {data.capacity.venueCapacity === null
            ? 'No capacity recorded for this venue'
            : data.capacity.expectedAttendance === null
              ? `${data.capacity.venueCapacity} seats · attendance not recorded`
              : `${data.capacity.venueCapacity} seats · ${data.capacity.expectedAttendance} expected`}
        </Row>

        {/* AC-2: a failure names each missing requirement. */}
        <Row label="Accessibility" status={data.accessibility.status}>
          {data.accessibility.status === 'NOT_REQUIRED'
            ? 'None required'
            : missing.length > 0
              ? `Missing: ${missing.map((item) => ACCESSIBILITY_FEATURE_LABELS[item.requirement]).join(', ')}`
              : data.accessibility.items
                  .map((item) => ACCESSIBILITY_FEATURE_LABELS[item.requirement])
                  .join(', ')}
        </Row>

        <Row label="Layout" status={data.layout.status}>
          {data.layout.requirement === null
            ? 'No preference'
            : data.layout.status === 'MET'
              ? humanise(data.layout.requirement)
              : `${humanise(data.layout.requirement)} not supported`}
        </Row>
      </dl>

      {/* Checks that did not run are named, never shown as passing. */}
      {data.notChecked.length > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
          <Info className="size-3.5 shrink-0" aria-hidden="true" />
          {data.notChecked.map((item) => humanise(item.check)).join(' and ')} not checked yet.
          <span className="sr-only">{data.notChecked.map((item) => item.reason).join(' ')}</span>
        </p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  status,
  children,
}: {
  label: string;
  status: SuitabilityCheckStatus;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_7rem_1fr] items-baseline gap-2 py-2">
      <StatusIcon status={status} />
      <dt className="font-medium text-ink-800">{label}</dt>
      <dd className={cn(status === 'UNMET' ? 'font-medium text-amber-800' : 'text-ink-600')}>
        {children}
      </dd>
    </div>
  );
}

const STATUS_LABEL: Record<SuitabilityCheckStatus, string> = {
  MET: 'Met',
  UNMET: 'Not met',
  NOT_REQUIRED: 'Nothing required',
  NOT_RECORDED: 'Not recorded',
};

/** Colour only where it carries meaning: green tick, amber warning, grey otherwise. */
function StatusIcon({ status }: { status: SuitabilityCheckStatus }) {
  const Icon = status === 'UNMET' ? AlertTriangle : status === 'NOT_RECORDED' ? Info : Check;
  return (
    <span className="self-center">
      <Icon
        className={cn(
          'size-4',
          status === 'MET' && 'text-emerald-600',
          status === 'UNMET' && 'text-amber-600',
          (status === 'NOT_REQUIRED' || status === 'NOT_RECORDED') && 'text-ink-400',
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{STATUS_LABEL[status]}: </span>
    </span>
  );
}
