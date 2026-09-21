import { useState } from 'react';

import { Button } from '@/components/ui/button'; // ASSUMPTION: adjust if the export differs
import { CheckboxRow, Field, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { fieldErrors, apiErrorMessage } from '@/lib/api-client';
import { ROOM_LAYOUTS, type RoomLayout, type VenueDraftPayload } from '@/types/api';

import { useCreateVenueDraft, usePublishVenue } from '../hooks/use-venues';

const DRAFT_FIELDS = [
    'name',
    'location',
    'capacity',
    'facilities',
    'accessibilityFeatures',
    'supportedLayouts',
    'operatingInfo',
] as const;

/**
 * A free-text tag list: type a value, press Enter or click Add, it becomes a
 * chip with a remove button. Used for `facilities` and `accessibilityFeatures`
 * — both are plain string[] on the backend (US-13: deliberately not an enum,
 * since a venue can advertise more than an event can request), so there's no
 * predefined list to pick from.
 */
function TagListInput({
    values,
    onChange,
    placeholder,
}: {
    values: string[];
    onChange: (next: string[]) => void;
    placeholder: string;
}) {
    const [draft, setDraft] = useState('');

    const add = () => {
        const value = draft.trim();
        if (value && !values.includes(value)) {
            onChange([...values, value]);
        }
        setDraft('');
    };

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <Input
                    value={draft}
                    placeholder={placeholder}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            add();
                        }
                    }}
                />
                <Button type="button" onClick={add}>
                    Add
                </Button>
            </div>
            {values.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                    {values.map((value) => (
                        <li
                            key={value}
                            className="flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-800"
                        >
                            {value}
                            <button
                                type="button"
                                onClick={() => onChange(values.filter((v) => v !== value))}
                                aria-label={`Remove ${value}`}
                                className="text-ink-500 hover:text-ink-800"
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

/**
 * US-13 "Add a new venue" (also serves US-14 "Update a venue's details" when
 * `venueId` is passed in — same fields, same validation, the AC difference is
 * only in what the backend enforces once a venue is PUBLISHED).
 */
export function VenueDraftForm({
    venueId,
    initialValues,
    onSaved,
    onPublished,
}: {
    /** Present when editing an existing venue; absent when creating one. */
    venueId?: string;
    initialValues?: VenueDraftPayload;
    onSaved?: (venueId: string) => void;
    onPublished?: () => void;
  }) {
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

    const createDraft = useCreateVenueDraft();
    const publish = usePublishVenue(savedId ?? '');

    const update = <K extends keyof VenueDraftPayload>(key: K, value: VenueDraftPayload[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    // US-13 AC-2: this deliberately does NOT block on missing fields — a
    // draft is allowed to be incomplete. The backend enforces completeness
    // only at publish time (AC-3), so the form doesn't duplicate that rule.
    const handleSaveDraft = () => {
        setErrors({});
        setGeneralError(null);

        createDraft.mutate(form, {
            onSuccess: (venue) => {
                setSavedId(venue.id);
                onSaved?.(venue.id);
            },
            onError: (error) => {
                const { byField, general } = fieldErrors(error, DRAFT_FIELDS);
                setErrors(byField);
                setGeneralError(general.join(' ') || apiErrorMessage(error, 'Could not save this venue.'));
            },
        });
    };

    // US-13 AC-3/AC-5/AC-6: only enabled once the venue has been saved at
    // least once. The backend is the source of truth on completeness — if
    // required fields are still missing, this surfaces that as field errors
    // the same way saveDraft does, rather than duplicating the completeness
    // check on the client.
    const handlePublish = () => {
        if (!savedId) return;
        setErrors({});
        setGeneralError(null);

        publish.mutate(undefined, {
            onSuccess: () => onPublished?.(),
            onError: (error) => {
                const { byField, general } = fieldErrors(error, DRAFT_FIELDS);
                setErrors(byField);
                setGeneralError(
                    general.join(' ') || apiErrorMessage(error, 'This venue is missing required fields.'),
                );
            },
        });
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

            {/* US-13 AC-1: location, capacity, facilities, accessibility, layouts, operating hours */}
            <Field label="Venue name" htmlFor="venue-name" errors={errors.name}>
                <Input
                    id="venue-name"
                    value={form.name ?? ''}
                    onChange={(e) => update('name', e.target.value)}
                    aria-invalid={(errors.name?.length ?? 0) > 0}
                />
            </Field>

            <Field label="Location" htmlFor="venue-location" errors={errors.location}>
                <Input
                    id="venue-location"
                    value={form.location ?? ''}
                    onChange={(e) => update('location', e.target.value)}
                    aria-invalid={(errors.location?.length ?? 0) > 0}
                />
            </Field>

            <Field label="Capacity" htmlFor="venue-capacity" errors={errors.capacity}>
                <Input
                    id="venue-capacity"
                    type="number"
                    min={1}
                    value={form.capacity ?? ''}
                    onChange={(e) => update('capacity', e.target.value ? Number(e.target.value) : null)}
                    aria-invalid={(errors.capacity?.length ?? 0) > 0}
                />
            </Field>

            <Field label="Facilities" htmlFor="venue-facilities" errors={errors.facilities}>
                <TagListInput
                    values={form.facilities ?? []}
                    onChange={(next) => update('facilities', next)}
                    placeholder="e.g. projector, stage"
                />
            </Field>

            <Field
                label="Accessibility features"
                htmlFor="venue-accessibility"
                errors={errors.accessibilityFeatures}
            >
                <TagListInput
                    values={form.accessibilityFeatures ?? []}
                    onChange={(next) => update('accessibilityFeatures', next)}
                    placeholder="e.g. step-free access"
                />
            </Field>

            <Field label="Supported layouts" htmlFor="venue-layouts" errors={errors.supportedLayouts}>
                <div className="space-y-1">
                    {ROOM_LAYOUTS.map((layout) => (
                        <CheckboxRow
                            key={layout}
                            id={`layout-${layout}`}
                            label={layout}
                            checked={(form.supportedLayouts ?? []).includes(layout)}
                            onChange={(checked) => {
                                const current = form.supportedLayouts ?? [];
                                update(
                                    'supportedLayouts',
                                    checked
                                        ? [...current, layout]
                                        : current.filter((l: RoomLayout) => l !== layout),
                                );
                            }}
                        />
                    ))}
                </div>
            </Field>

            <Field label="Operating hours" htmlFor="venue-operating-info" errors={errors.operatingInfo}>
                <Textarea
                    id="venue-operating-info"
                    value={form.operatingInfo ?? ''}
                    onChange={(e) => update('operatingInfo', e.target.value)}
                />
            </Field>

            <div className="flex gap-3">
                <Button type="submit" disabled={createDraft.isPending}>
                    {createDraft.isPending ? 'Saving…' : 'Save draft'}
                </Button>

                {/* US-13 AC-3: only available once a draft exists to publish. */}
                <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={!savedId || publish.isPending}
                >
                    {publish.isPending ? 'Publishing…' : 'Publish to catalogue'}
                </Button>
            </div>
        </form>
    );
}