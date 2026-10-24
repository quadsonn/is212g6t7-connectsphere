import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { attendanceBandLabel } from '@/lib/attendance-bands';
import { formatDateRange, humanise } from '@/lib/utils';
import { ACCESSIBILITY_FEATURE_LABELS, FACILITY_LABELS, type VenueBooking } from '@/types/api';
import { BookingDecisionHistory } from './booking-decision-history';
import { BookingStatusBadge } from './booking-status-badge';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * Everything on a booking request, in one place. Shared by the Coordinator's
 * view and the Venue Staff review view, so both sides see the same record.
 */
export function BookingDetails({ booking }: { booking: VenueBooking }) {
  // Story 20 AC-2: a request made before the technical copy existed has none.
  const technicalRecorded = booking.equipmentRequirements != null;
  const NOT_RECORDED = 'Not recorded on this request';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
          <BookingStatusBadge status={booking.status} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Venue">
            {booking.venue.name ?? '—'}
            {booking.venue.location ? (
              <span className="block text-ink-500">{booking.venue.location}</span>
            ) : null}
          </Field>
          <Field label="Date and time">{formatDateRange(booking.start, booking.end)}</Field>
          <Field label="Expected attendance">
            {attendanceBandLabel(booking.expectedAttendance)}
            {booking.venue.capacity ? (
              <span className="text-ink-500"> (venue capacity {booking.venue.capacity})</span>
            ) : null}
          </Field>
          <Field label="Submitted">{new Date(booking.createdAt).toLocaleString()}</Field>
          {booking.decisionReason ? (
            <div className="sm:col-span-2">
              <Field label="Decision reason">{booking.decisionReason}</Field>
            </div>
          ) : null}
          {/* US-52: the venue became unavailable, and what replaced it. */}
          {booking.unavailableReason ? (
            <div className="sm:col-span-2">
              <Field label="Venue unavailable">
                {booking.unavailableFrom && booking.unavailableUntil
                  ? `${formatDateRange(booking.unavailableFrom, booking.unavailableUntil)} — `
                  : ''}
                {booking.unavailableReason}
              </Field>
            </div>
          ) : null}
          {booking.status === 'RELEASED' && booking.releasedAt ? (
            <div className="sm:col-span-2">
              <Field label="Released">
                {new Date(booking.releasedAt).toLocaleString()} — a replacement booking was
                confirmed. This record is kept for reference.
              </Field>
            </div>
          ) : null}
          {booking.replacesBookingId ? (
            <div className="sm:col-span-2">
              <Field label="Replacement">
                Requested to replace a booking whose venue became unavailable. Approving it releases
                that booking.
              </Field>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Event">{booking.event.name ?? 'Untitled event'}</Field>
          <Field label="Organiser">
            {booking.event.organiser.name}
            <span className="block text-ink-500">{booking.event.organiser.email}</span>
          </Field>
          <Field label="Requested by">
            {booking.requestedBy ? (
              <>
                {booking.requestedBy.name}
                <span className="block text-ink-500">{booking.requestedBy.email}</span>
              </>
            ) : (
              '—'
            )}
          </Field>
        </CardContent>
      </Card>

      {/* US-21 AC-2: the requirements as submitted with the request. */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Layout">
            {booking.preferredLayout ? humanise(booking.preferredLayout) : 'No preference'}
          </Field>
          <Field label="Layout notes">{booking.layoutNotes ?? '—'}</Field>
          <div className="sm:col-span-2">
            <Field label="Accessibility">
              {booking.accessibilityRequirements.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {booking.accessibilityRequirements.map((feature) => (
                    <Badge key={feature} className="bg-ink-100 text-ink-700 ring-ink-300">
                      {ACCESSIBILITY_FEATURE_LABELS[feature]}
                    </Badge>
                  ))}
                </span>
              ) : (
                'None recorded'
              )}
            </Field>
          </div>
          <Field label="Accessibility notes">{booking.accessibilityNotes ?? '—'}</Field>
          <Field label="Equipment notes">{booking.equipmentNeeds ?? 'None recorded'}</Field>

          {/* Story 20 AC-2: the technical requirements, as submitted. */}
          <div className="sm:col-span-2">
            <Field label="Equipment requested">
              {!technicalRecorded ? (
                NOT_RECORDED
              ) : booking.equipmentRequirements!.length > 0 ? (
                <ul aria-label="Equipment requested" className="list-disc pl-5">
                  {booking.equipmentRequirements!.map((line, i) => (
                    <li key={i}>
                      {line.quantity} × {line.equipmentType}
                      {line.notes ? ` (${line.notes})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                'None recorded'
              )}
            </Field>
          </div>
          <Field label="Technical support">
            {!technicalRecorded ? NOT_RECORDED : (booking.technicalSupportNeeds ?? 'None recorded')}
          </Field>
          <Field label="Required facilities">
            {!technicalRecorded
              ? NOT_RECORDED
              : booking.requiredFacilities.length > 0
                ? booking.requiredFacilities.map((f) => FACILITY_LABELS[f]).join(', ')
                : 'None recorded'}
          </Field>
        </CardContent>
      </Card>

      {/* US-23 AC-4/AC-5/AC-6 */}
      <Card>
        <CardHeader>
          <CardTitle>Decision history</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingDecisionHistory decisions={booking.decisions} />
        </CardContent>
      </Card>
    </div>
  );
}
