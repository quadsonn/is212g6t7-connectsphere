import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/form';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SafetyHistory } from '@/features/safety/components/safety-history';
import { useDecideSafety, useSafetyPacket } from '@/features/safety/hooks/use-safety';
import { apiErrorMessage } from '@/lib/api-client';
import { cn, formatDateRange, formatDateTime, humanise } from '@/lib/utils';
import {
  ACCESSIBILITY_FEATURE_LABELS,
  type SafetyDecisionPayload,
  type SafetyOutcome,
  type SafetyReturnStage,
} from '@/types/api';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children || '—'}</dd>
    </div>
  );
}

/**
 * The three outcomes as radio cards. Class names are written out in full (not
 * built from a colour variable) so Tailwind can see them.
 */
const OUTCOMES: {
  value: SafetyOutcome;
  label: string;
  hint: string;
  checked: string;
}[] = [
  {
    value: 'APPROVED',
    label: 'Approve',
    hint: 'The event is confirmed and can proceed.',
    checked: 'has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-50',
  },
  {
    value: 'CHANGES_REQUESTED',
    label: 'Request changes',
    hint: 'The event goes back to the Coordinator to rework. A reason is required.',
    checked: 'has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50',
  },
  {
    value: 'REJECTED',
    label: 'Reject',
    hint: 'The event is blocked and goes back to the Coordinator to rework. A reason is required.',
    checked: 'has-[:checked]:border-red-600 has-[:checked]:bg-red-50',
  },
];

const STAGES: { value: SafetyReturnStage; label: string; hint: string }[] = [
  {
    value: 'VENUE',
    label: 'Venue planning',
    hint: 'The Coordinator reworks the venue; the booking is flagged for re-review.',
  },
  {
    value: 'TECHNICAL',
    label: 'Technical planning',
    hint: 'The Coordinator reworks the equipment; the reservation is flagged for re-review.',
  },
];

const CHOICE_BASE =
  'flex cursor-pointer gap-3 rounded-lg border border-ink-300 bg-white p-3 transition-colors ' +
  'hover:bg-ink-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ' +
  'has-[:focus-visible]:outline-brand-600';

/**
 * One choice in a radio group, drawn as a card. The input is a real radio
 * (visually hidden), so arrow keys, focus and screen readers behave natively;
 * the card shows the state.
 */
function Choice({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
  checkedClass = 'has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50',
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  checkedClass?: string;
}) {
  return (
    <label className={cn(CHOICE_BASE, checkedClass)}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-ink-900' : 'border-ink-400',
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-ink-900" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-600">{hint}</span> : null}
      </span>
    </label>
  );
}

/** The four factors reviewed, each with a comment box. */
const FACTORS = [
  ['emergencyAccessComment', 'Emergency access'],
  ['crowdMovementComment', 'Crowd movement'],
  ['equipmentPlacementComment', 'Equipment placement'],
  ['accessibilityComment', 'Accessibility'],
] as const;

type FactorKey = (typeof FACTORS)[number][0];

/** The Safety Officer's review of one queued event, and the decision form. */
export function SafetyReview() {
  const { id } = useParams<{ id: string }>();
  const { data: packet, isPending, isError, error } = useSafetyPacket(id);
  const decide = useDecideSafety(id ?? '');

  const [outcome, setOutcome] = useState<SafetyOutcome | ''>('');
  const [returnStage, setReturnStage] = useState<SafetyReturnStage | ''>('');
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState<Record<FactorKey, string>>({
    emergencyAccessComment: '',
    crowdMovementComment: '',
    equipmentPlacementComment: '',
    accessibilityComment: '',
  });
  // Per factor: false = "Reviewed, no comments", true = there is a comment.
  const [commenting, setCommenting] = useState<Record<FactorKey, boolean>>({
    emergencyAccessComment: false,
    crowdMovementComment: false,
    equipmentPlacementComment: false,
    accessibilityComment: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const needsReason = outcome === 'REJECTED' || outcome === 'CHANGES_REQUESTED';
  const errors = {
    outcome: submitted && outcome === '' ? ['Choose an outcome.'] : undefined,
    returnStage:
      submitted && outcome === 'CHANGES_REQUESTED' && returnStage === ''
        ? ['Choose the planning stage to return to.']
        : undefined,
    reason:
      submitted && needsReason && reason.trim() === ''
        ? ['A reason is required to reject or request changes.']
        : undefined,
  };
  // Choosing "Add a comment" is a promise to write one.
  const emptyComment = (key: FactorKey) =>
    submitted && commenting[key] && comments[key].trim() === ''
      ? ["Write the comment, or choose 'Reviewed, no comments'."]
      : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (outcome === '') return;
    if (needsReason && reason.trim() === '') return;
    if (outcome === 'CHANGES_REQUESTED' && returnStage === '') return;
    if (FACTORS.some(([key]) => commenting[key] && comments[key].trim() === '')) return;

    const payload: SafetyDecisionPayload = { outcome };
    if (needsReason) payload.reason = reason;
    if (outcome === 'CHANGES_REQUESTED' && returnStage !== '') payload.returnStage = returnStage;
    for (const [key] of FACTORS) {
      if (commenting[key] && comments[key].trim()) payload[key] = comments[key];
    }
    decide.mutate(payload);
  }

  const decided = decide.data;

  return (
    <>
      <PageHeader
        title={packet?.event.name ?? 'Safety check'}
        description="Review the event's operational safety, then record one decision."
        action={
          <LinkButton to="/safety/checks" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to queue
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading the review…" /> : null}
      {isError && !decided ? (
        <ErrorState
          message={apiErrorMessage(
            error,
            'This event is not awaiting a safety check — it may already have been decided.',
          )}
        />
      ) : null}

      {packet ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Expected attendance">{packet.event.expectedAttendance}</Detail>
                <Detail label="Date and time">
                  {formatDateRange(packet.event.proposedStart, packet.event.proposedEnd)}
                </Detail>
                <Detail label="Requested layout">
                  {packet.event.preferredLayout
                    ? `${humanise(packet.event.preferredLayout)}${
                        packet.event.layoutNotes ? ` — ${packet.event.layoutNotes}` : ''
                      }`
                    : null}
                </Detail>
                <Detail label="Accessibility requirements">
                  {packet.event.accessibilityRequirements.length > 0
                    ? packet.event.accessibilityRequirements
                        .map((f) => ACCESSIBILITY_FEATURE_LABELS[f])
                        .join(', ') +
                      (packet.event.accessibilityNotes ? ` — ${packet.event.accessibilityNotes}` : '')
                    : packet.event.accessibilityNotes}
                </Detail>
                <Detail label="Coordinator">{packet.event.coordinator?.name}</Detail>
                <Detail label="Organiser">{packet.event.organiser.name}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Venues</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {packet.venues.map((v) => {
                const over = v.capacityMargin !== null && v.capacityMargin < 0;

                return (
                  <div key={v.bookingId} className="rounded-lg border border-ink-200 p-4">
                    <p className="font-medium text-ink-900">
                      {v.venue.name ?? 'Venue'}
                      {v.venue.location ? `, ${v.venue.location}` : ''}
                    </p>
                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Detail label="Capacity">
                        {v.venue.capacity !== null ? (
                          <span className={cn(over && 'font-semibold text-red-700')}>
                            {v.venue.capacity}
                            {v.capacityMargin !== null
                              ? over
                                ? ` — ${-v.capacityMargin} over the expected attendance`
                                : ` — ${v.capacityMargin} spare`
                              : ''}
                          </span>
                        ) : null}
                      </Detail>
                      <Detail label="Booked">{formatDateRange(v.start, v.end)}</Detail>
                      <Detail label="Supported layouts">
                        {v.venue.supportedLayouts.map(humanise).join(', ')}
                      </Detail>
                      <Detail label="Accessibility features">
                        {v.venue.accessibilityFeatures
                          .map((f) => ACCESSIBILITY_FEATURE_LABELS[f as keyof typeof ACCESSIBILITY_FEATURE_LABELS] ?? humanise(f))
                          .join(', ')}
                      </Detail>
                      <div className="sm:col-span-2">
                        <Detail label="Restrictions">{v.venue.operatingInfo}</Detail>
                      </div>
                    </dl>
                    {v.blocks.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="flex items-center gap-2 font-medium">
                          <AlertTriangle className="size-4" aria-hidden="true" />
                          Blocked during this booking
                        </p>
                        <ul className="mt-1 list-disc pl-6">
                          {v.blocks.map((b) => (
                            <li key={b.id}>
                              {b.reason} · {formatDateRange(b.start, b.end)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipment</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail label="Requested">
                  {packet.equipment.requirements.length > 0 ? (
                    <ul>
                      {packet.equipment.requirements.map((r, index) => (
                        <li key={`${r.equipmentType}-${index}`}>
                          {r.quantity} × {r.equipmentType}
                          {r.notes ? ` — ${r.notes}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    packet.event.equipmentNeeds
                  )}
                </Detail>
                <Detail label="Reserved">
                  {packet.equipment.reservations.length > 0 ? (
                    <ul>
                      {packet.equipment.reservations.map((r) => (
                        <li key={r.id}>
                          {r.quantity} × {r.equipmentType}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Technical support needed">{packet.event.technicalSupportNeeds}</Detail>
                </div>
              </dl>
            </CardContent>
          </Card>

          {packet.history.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Earlier checks of this event</CardTitle>
              </CardHeader>
              <CardContent>
                <SafetyHistory reviews={packet.history} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {packet || decided ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Your decision</CardTitle>
          </CardHeader>
          <CardContent>
            {decided ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  Recorded {formatDateTime(decided.createdAt)}.{' '}
                  {decided.outcome === 'APPROVED'
                    ? 'The event is confirmed.'
                    : decided.outcome === 'CHANGES_REQUESTED'
                      ? `The event is back in ${humanise(decided.returnStage ?? '')} planning and the Coordinator has been notified.`
                      : 'The event is blocked and the Coordinator has been notified.'}
                </span>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-6">
                <fieldset>
                  <legend className="text-sm font-medium text-ink-800">Factors reviewed</legend>
                  <p className="mt-0.5 text-xs text-ink-500">
                    For each factor, say you reviewed it with nothing to add, or write what you found.
                  </p>
                  <div className="mt-3 space-y-3">
                    {FACTORS.map(([key, label]) => {
                      const name = `safety-factor-${key}`;
                      const error = emptyComment(key);

                      return (
                        <div key={key} className="rounded-lg border border-ink-200 p-3">
                          <div role="radiogroup" aria-label={label}>
                            <p className="text-sm font-medium text-ink-900">{label}</p>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Choice
                                name={name}
                                value="none"
                                label="Reviewed, no comments"
                                checked={!commenting[key]}
                                onChange={() => setCommenting({ ...commenting, [key]: false })}
                              />
                              <Choice
                                name={name}
                                value="comment"
                                label="Add a comment"
                                checked={commenting[key]}
                                onChange={() => setCommenting({ ...commenting, [key]: true })}
                              />
                            </div>
                          </div>
                          {commenting[key] ? (
                            <div className="mt-3">
                              <Field
                                label={`${label} — comment`}
                                htmlFor={`safety-${key}`}
                                errors={error}
                              >
                                <Textarea
                                  id={`safety-${key}`}
                                  rows={2}
                                  maxLength={1000}
                                  value={comments[key]}
                                  onChange={(e) => setComments({ ...comments, [key]: e.target.value })}
                                  aria-invalid={error ? true : undefined}
                                />
                              </Field>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-medium text-ink-800">
                    Outcome<span className="ml-1 text-red-600" aria-hidden="true">*</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {OUTCOMES.map((o) => (
                      <Choice
                        key={o.value}
                        name="safety-outcome"
                        value={o.value}
                        label={o.label}
                        hint={o.hint}
                        checked={outcome === o.value}
                        checkedClass={o.checked}
                        onChange={() => setOutcome(o.value)}
                      />
                    ))}
                  </div>
                  {errors.outcome ? (
                    <p role="alert" className="mt-1.5 text-xs text-red-700">
                      {errors.outcome[0]}
                    </p>
                  ) : null}
                </fieldset>

                {outcome === 'CHANGES_REQUESTED' ? (
                  <fieldset>
                    <legend className="text-sm font-medium text-ink-800">
                      Return to<span className="ml-1 text-red-600" aria-hidden="true">*</span>
                    </legend>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {STAGES.map((stage) => (
                        <Choice
                          key={stage.value}
                          name="safety-stage"
                          value={stage.value}
                          label={stage.label}
                          hint={stage.hint}
                          checked={returnStage === stage.value}
                          onChange={() => setReturnStage(stage.value)}
                        />
                      ))}
                    </div>
                    {errors.returnStage ? (
                      <p role="alert" className="mt-1.5 text-xs text-red-700">
                        {errors.returnStage[0]}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}

                {needsReason ? (
                  <Field label="Reason" htmlFor="safety-reason" required errors={errors.reason}>
                    <Textarea
                      id="safety-reason"
                      rows={3}
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      aria-invalid={errors.reason ? true : undefined}
                    />
                  </Field>
                ) : null}

                {decide.error ? (
                  <ErrorState message={apiErrorMessage(decide.error, 'Could not record the decision.')} />
                ) : null}

                <Button
                  type="submit"
                  variant={outcome === 'REJECTED' ? 'danger' : 'primary'}
                  disabled={decide.isPending}
                >
                  {decide.isPending ? 'Recording…' : 'Record decision'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
