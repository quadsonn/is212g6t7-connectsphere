import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { CheckboxGroup, CheckboxRow, Field, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { fieldErrors, apiErrorMessage } from '@/lib/api-client';
import {
    ACCESSIBILITY_FEATURES,
    ACCESSIBILITY_FEATURE_LABELS,
    FACILITIES,
    FACILITY_LABELS,
    ROOM_LAYOUTS,
    type RoomLayout,
    type VenueDraftPayload,
    type VenueStatus,
} from '@/types/api';

import { useCreateVenueDraft, usePublishVenue, useUpdateVenue } from '../hooks/use-venues';

const DRAFT_FIELDS = [
    'name',
    'location',
    'capacity',
    'facilities',
    'facilityNotes',
    'accessibilityFeatures',
    'accessibilityNotes',
    'supportedLayouts',
    'operatingInfo',
] as const;

/**
 * Operating-hours picker, in 30-minute increments.
 *
 * Start time runs 6:00 AM to 11:30 PM — venues essentially never need to
 * open before 6 AM. End time runs the same range PLUS 12:00 AM through
 * 4:00 AM the next day, since events that run late (a year-end party, a
 * gala) commonly close well past midnight — capping this at exactly
 * midnight would make those un-selectable. A venue with no fixed hours
 * at all is handled separately by the "Open 24 hours" checkbox.
 *
 * Times past midnight are represented internally as hours 24-28 (e.g.
 * "25:30" means 1:30 AM the next day) purely so every option in the list
 * has a distinct, sortable value — formatTime() converts that back to a
 * normal-looking "1:30 AM (next day)" for display.
 */
function buildTimeOptions(startMinutes: number, endMinutes: number): string[] {
    const opts: string[] = [];
    for (let totalMin = startMinutes; totalMin <= endMinutes; totalMin += 30) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        opts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
    return opts;
}
const TIME_OPTIONS = [...buildTimeOptions(6 * 60, 23 * 60 + 30), '00:00']; // 6:00 AM – 11:30 PM, then 12:00 AM
const END_TIME_OPTIONS = buildTimeOptions(6 * 60, 28 * 60); // 6:00 AM – 4:00 AM (next day)

function formatTime(value: string): string {
    // No "(next day)" suffix — within this picker's own option lists, an end
    // time of 12:00 AM–4:00 AM can only ever mean the early hours of the
    // following day (the range never offers those as a same-day start), so
    // "6:00 PM – 1:00 AM" already reads unambiguously without a qualifier.
    const [hRaw, m] = value.split(':').map(Number);
    const h = hRaw % 24;
    const period = h < 12 ? 'AM' : 'PM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Recognises only the exact format this picker itself generates. Any
 * other existing text (typed before this picker existed) is left as-is
 * until the person picks new times, rather than risk mis-parsing it. */
function parseOperatingInfo(
    raw: string | null | undefined,
): { start: string; end: string; is24: boolean } {
    if (raw === 'Open 24 hours') return { start: '', end: '', is24: true };
    if (raw) {
        // The trailing "(?: \(next day\))?" still matches text saved by an
        // earlier version of this picker that did include the suffix — kept
        // for backward compatibility, just no longer required or generated.
        const match = raw.match(
            /^(\d{1,2}):(\d{2}) (AM|PM) – (\d{1,2}):(\d{2}) (AM|PM)(?: \(next day\))?$/,
        );
        if (match) {
            const to24 = (h: string, period: string) => {
                let hour = Number(h) % 12;
                if (period === 'PM') hour += 12;
                return hour;
            };
            const start = `${to24(match[1], match[3]).toString().padStart(2, '0')}:${match[2]}`;

            // Infer the wrap to the next day from the time itself: within this
            // picker's own ranges, an end time of 12/1/2/3/4 AM can only be a
            // next-day value (the option list never offers those as a same-day
            // start) — so no explicit "(next day)" text is needed to tell.
            const endHour12 = Number(match[4]);
            const endPeriod = match[6];
            const isNextDay =
                raw.includes('(next day)') ||
                (endPeriod === 'AM' && (endHour12 === 12 || endHour12 <= 4));
            const endHour = to24(match[4], endPeriod) + (isNextDay ? 24 : 0);
            const end = `${endHour.toString().padStart(2, '0')}:${match[5]}`;
            return { start, end, is24: false };
        }
    }
    return { start: '', end: '', is24: false };
}

export function VenueDraftForm({
    venueId,
    initialValues,
    initialStatus,
    onSaved,
    onPublished,
}: {
    venueId?: string;
    initialValues?: VenueDraftPayload;
    /** The venue's current status, so an already-published venue doesn't show
     * a redundant "Publish to catalogue" button. Omit for a brand-new venue
     * (treated as DRAFT). */
    initialStatus?: VenueStatus;
    onSaved?: (venueId: string) => void;
    onPublished?: () => void;
}) {
    const navigate = useNavigate();

    const initialHours = parseOperatingInfo(initialValues?.operatingInfo);
    const [startTime, setStartTime] = useState(initialHours.start);
    const [endTime, setEndTime] = useState(initialHours.end);
    const [is24Hours, setIs24Hours] = useState(initialHours.is24);
    const [form, setForm] = useState<VenueDraftPayload>(
        initialValues ?? {
            name: '',
            location: '',
            capacity: undefined,
            facilities: [],
            accessibilityFeatures: [],
            supportedLayouts: [],
            operatingInfo: '',
        },
    );
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [generalError, setGeneralError] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(venueId ?? null);
    const [status, setStatus] = useState<VenueStatus>(initialStatus ?? 'DRAFT');
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const createDraft = useCreateVenueDraft();
    const update = useUpdateVenue();
    const publish = usePublishVenue();

    const update_ = <K extends keyof VenueDraftPayload>(key: K, value: VenueDraftPayload[K]) => {
        setSuccessMessage(null);
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const applyOperatingHours = (nextStart: string, nextEnd: string, next24: boolean) => {
        if (next24) {
            update_('operatingInfo', 'Open 24 hours');
            return;
        }
        if (nextStart && nextEnd) {
            update_('operatingInfo', `${formatTime(nextStart)} – ${formatTime(nextEnd)}`);
        } else {
            update_('operatingInfo', '');
        }
    };

    // Whether the current form values would pass the backend's publish
    // completeness check (mirrors PublishableVenueDto: name, location,
    // capacity — nothing else is required to publish).
    const isPublishable = Boolean(
        form.name?.trim() && form.location?.trim() && form.capacity != null && form.capacity > 0,
    );

    const busy = createDraft.isPending || update.isPending || publish.isPending;

    /** Creates the venue if it doesn't exist yet, or updates it if it does. */
    const persist = async (): Promise<string> => {
        if (savedId) {
            await update.mutateAsync({ id: savedId, payload: form });
            return savedId;
        }
        const venue = await createDraft.mutateAsync(form);
        setSavedId(venue.id);
        onSaved?.(venue.id);
        return venue.id;
    };

    const handleSaveDraft = async () => {
        setErrors({});
        setGeneralError(null);
        setSuccessMessage(null);
        const wasNew = !savedId;
        try {
            await persist();
            setSuccessMessage(wasNew ? 'Draft saved.' : 'Changes saved.');
        } catch (error) {
            const { byField, general } = fieldErrors(error, DRAFT_FIELDS);
            setErrors(byField);
            setGeneralError(general.join(' ') || apiErrorMessage(error, 'Could not save this venue.'));
        }
    };

    const handlePublish = async () => {
        setErrors({});
        setGeneralError(null);
        setSuccessMessage(null);
        try {
            const id = await persist();
            await publish.mutateAsync(id);
            setStatus('PUBLISHED');
            setSuccessMessage('Published to the catalogue.');
            onPublished?.();
        } catch (error) {
            const { byField, general } = fieldErrors(error, DRAFT_FIELDS);
            setErrors(byField);
            setGeneralError(
                general.join(' ') || apiErrorMessage(error, 'Could not publish this venue.'),
            );
        }
    };

    return (
        <form
            className="space-y-6"
            onSubmit={(e) => {
                e.preventDefault();
                handleSaveDraft();
            }}
        >
            {generalError ? (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {generalError}
                </p>
            ) : null}

            <Field label="Venue name" htmlFor="venue-name" errors={errors.name} required>
                <Input
                    id="venue-name"
                    value={form.name ?? ''}
                    onChange={(e) => update_('name', e.target.value)}
                    aria-invalid={(errors.name?.length ?? 0) > 0}
                />
            </Field>

            <Field label="Location" htmlFor="venue-location" errors={errors.location} required>
                <Input
                    id="venue-location"
                    value={form.location ?? ''}
                    onChange={(e) => update_('location', e.target.value)}
                    aria-invalid={(errors.location?.length ?? 0) > 0}
                />
            </Field>

            <Field label="Capacity" htmlFor="venue-capacity" errors={errors.capacity} required>
                <Input
                    id="venue-capacity"
                    type="number"
                    min={1}
                    value={form.capacity ?? ''}
                    onChange={(e) => update_('capacity', e.target.value ? Number(e.target.value) : null)}
                    aria-invalid={(errors.capacity?.length ?? 0) > 0}
                />
            </Field>

            {/* US-18: fixed vocabularies so Coordinators can search on them.
                Anything outside the list goes in the notes beneath. */}
            <Field label="Facilities" htmlFor="venue-facilities" errors={errors.facilities}>
                <CheckboxGroup
                    idPrefix="facility"
                    options={FACILITIES}
                    labels={FACILITY_LABELS}
                    values={form.facilities ?? []}
                    onChange={(next) => update_('facilities', next)}
                    className="grid sm:grid-cols-2 sm:space-y-0"
                />
            </Field>

            <Field label="Other facilities" htmlFor="venue-facility-notes" errors={errors.facilityNotes}>
                <Textarea
                    id="venue-facility-notes"
                    rows={2}
                    placeholder="Anything not in the list above, e.g. marquee anchor points"
                    value={form.facilityNotes ?? ''}
                    onChange={(e) => update_('facilityNotes', e.target.value)}
                />
            </Field>

            <Field
                label="Accessibility features"
                htmlFor="venue-accessibility"
                errors={errors.accessibilityFeatures}
            >
                <CheckboxGroup
                    idPrefix="accessibility"
                    options={ACCESSIBILITY_FEATURES}
                    labels={ACCESSIBILITY_FEATURE_LABELS}
                    values={form.accessibilityFeatures ?? []}
                    onChange={(next) => update_('accessibilityFeatures', next)}
                    className="grid sm:grid-cols-2 sm:space-y-0"
                />
            </Field>

            <Field
                label="Other accessibility provision"
                htmlFor="venue-accessibility-notes"
                errors={errors.accessibilityNotes}
            >
                <Textarea
                    id="venue-accessibility-notes"
                    rows={2}
                    placeholder="e.g. braille signage, quiet room"
                    value={form.accessibilityNotes ?? ''}
                    onChange={(e) => update_('accessibilityNotes', e.target.value)}
                />
            </Field>

            <Field label="Supported layouts" htmlFor="venue-layouts" errors={errors.supportedLayouts}>
                <div className="space-y-1">
                    {ROOM_LAYOUTS.map((layout) => (
                        <CheckboxRow
                            key={layout}
                            id={`layout-${layout}`}
                            label={layout.replace(/_/g, ' ')}
                            checked={(form.supportedLayouts ?? []).includes(layout)}
                            onChange={(checked) => {
                                const current = form.supportedLayouts ?? [];
                                update_(
                                    'supportedLayouts',
                                    checked
                                        ? [...current, layout]
                                        : current.filter((l: RoomLayout) => l !== layout),
                                );
                            }}
                        />
                    ))}
                    <CheckboxRow
                        id="layout-other"
                        label="Other"
                        checked={form.layoutNotes !== null && form.layoutNotes !== undefined}
                        onChange={(checked) => update_('layoutNotes', checked ? '' : null)}
                    />
                    {form.layoutNotes !== null && form.layoutNotes !== undefined ? (
                        <Input
                            className="mt-2"
                            placeholder="Describe the layout"
                            value={form.layoutNotes ?? ''}
                            onChange={(e) => update_('layoutNotes', e.target.value)}
                        />
                    ) : null}
                </div>
            </Field>

            <Field label="Operating hours" htmlFor="venue-operating-start" errors={errors.operatingInfo}>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-ink-700">
                        <input
                            type="checkbox"
                            checked={is24Hours}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setIs24Hours(checked);
                                applyOperatingHours(startTime, endTime, checked);
                            }}
                            className="size-4 rounded border-ink-300"
                        />
                        Open 24 hours
                    </label>

                    {!is24Hours ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                id="venue-operating-start"
                                value={startTime}
                                onChange={(e) => {
                                    setStartTime(e.target.value);
                                    applyOperatingHours(e.target.value, endTime, is24Hours);
                                }}
                                className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900"
                            >
                                <option value="">Start time</option>
                                {TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                        {formatTime(t)}
                                    </option>
                                ))}
                            </select>
                            <span className="text-ink-500">to</span>
                            <select
                                id="venue-operating-end"
                                value={endTime}
                                onChange={(e) => {
                                    setEndTime(e.target.value);
                                    applyOperatingHours(startTime, e.target.value, is24Hours);
                                }}
                                className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900"
                            >
                                <option value="">End time</option>
                                {END_TIME_OPTIONS.map((t) => (
                                    <option key={t} value={t}>
                                        {formatTime(t)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}
                </div>
            </Field>

            <div className="flex gap-3">
                <Button type="submit" disabled={busy}>
                    {createDraft.isPending || update.isPending
                        ? 'Saving…'
                        : savedId
                            ? 'Save changes'
                            : 'Save draft'}
                </Button>

                {/* Enabled by field completeness, not by having saved first. Hidden
            once already published — publishing an already-published venue
            is meaningless, unlike a draft, which should stay publishable. */}
                {status !== 'PUBLISHED' ? (
                    <Button type="button" onClick={handlePublish} disabled={!isPublishable || busy}>
                        {publish.isPending ? 'Publishing…' : 'Publish to catalogue'}
                    </Button>
                ) : null}
            </div>

            {/* At the bottom, next to the buttons that caused it — not at the top,
          which would need scrolling back up to see on a long form. */}
            {successMessage ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 px-3 py-2">
                    <p role="status" className="text-sm text-green-700">
                        {successMessage}
                    </p>
                    <Button
                        type="button"
                        onClick={() => navigate('/venues')}
                        className="border border-ink-200 bg-white text-ink-700 shadow-sm hover:bg-ink-50"
                    >
                        Back to venue catalogue
                    </Button>
                </div>
            ) : null}
        </form>
    );
}