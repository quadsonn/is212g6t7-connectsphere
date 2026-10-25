import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Send } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EventRequestFields } from '@/features/events/components/event-request-fields';
import {
  EMPTY_EVENT_REQUEST_FORM,
  EVENT_REQUEST_FIELDS,
  mapExistingToForm,
  toPayload,
  type EventRequestFormState,
  type SetEventRequestField,
} from '@/features/events/lib/event-request-form';
import {
  useCreateEventRequest,
  useMyRequest,
  useUpdateEventRequest,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage, fieldErrors } from '@/lib/api-client';
import { EDITABLE_EVENT_STATUSES } from '@/lib/status';
import { humanise } from '@/lib/utils';

/**
 * Doubles as both "New event request" (US-03/US-04) and "Edit request"
 * (US-04 AC-2, US-08) — the fields are identical, and keeping one form means
 * validation and layout cannot drift between the two. Route with an :id
 * param (`/organiser/:id/edit`) puts it in edit mode; `/organiser/new` puts
 * it in create mode.
 */
export function OrganiserNewRequest() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const { submit: createSubmit, saveDraft } = useCreateEventRequest();
  const { saveChanges, submit: editSubmit } = useUpdateEventRequest(id ?? '');
  const {
    data: existing,
    isPending: loadingExisting,
    isError: loadFailed,
    error: loadError,
  } = useMyRequest(id);

  const [form, setForm] = useState<EventRequestFormState>(EMPTY_EVENT_REQUEST_FORM);
  const [hydrated, setHydrated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  // Prefill once the existing request arrives — guarded so a background
  // refetch (e.g. after saving) doesn't clobber what the Organiser is typing.
  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setForm(mapExistingToForm(existing));
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const set: SetEventRequestField = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const pending = isEdit
    ? editSubmit.isPending || saveChanges.isPending
    : createSubmit.isPending || saveDraft.isPending;

  const run = async (action: 'submit' | 'draft') => {
    setErrors({});
    setGeneral([]);
    setBanner(null);

    const mutation = isEdit
      ? action === 'submit'
        ? editSubmit
        : saveChanges
      : action === 'submit'
        ? createSubmit
        : saveDraft;

    try {
      await mutation.mutateAsync(toPayload(form));
      // US-03 AC-2: the Organiser is told the request went through.
      toast.success(
        action === 'submit'
          ? 'Request submitted for review.'
          : isEdit
            ? 'Changes saved.'
            : 'Draft saved.',
      );
      navigate(isEdit ? `/organiser/${id}` : '/organiser');
    } catch (error) {
      // The API flags every offending field at once; show each against its
      // own input rather than as one wall of text.
      const mapped = fieldErrors(error, EVENT_REQUEST_FIELDS);
      setErrors(mapped.byField);
      setGeneral(mapped.general);

      if (Object.keys(mapped.byField).length === 0 && mapped.general.length === 0) {
        setBanner(apiErrorMessage(error, 'Could not save the request.'));
      } else {
        setBanner('Please correct the highlighted fields.');
      }
    }
  };

  if (isEdit && loadingExisting) {
    return (
      <>
        <PageHeader title="Edit event request" description="Loading your request…" />
        <LoadingState label="Loading request…" />
      </>
    );
  }

  if (isEdit && loadFailed) {
    return (
      <>
        <PageHeader title="Edit event request" description="Loading your request…" />
        <ErrorState message={apiErrorMessage(loadError, 'Could not load this request.')} />
      </>
    );
  }

  if (isEdit && existing && !EDITABLE_EVENT_STATUSES.includes(existing.status)) {
    return (
      <>
        <PageHeader title="Edit event request" description={existing.name ?? 'Untitled draft'} />
        <ErrorState
          message={`This request is ${humanise(existing.status)} and can no longer be edited.`}
        />
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={() => navigate(`/organiser/${id}`)}>
            Back to request
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit event request' : 'New event request'}
        description={
          isEdit
            ? 'Update your draft, then save your changes or submit it for review.'
            : 'Save as a draft while you gather details, or submit it for review.'
        }
      />

      <form
        className="max-w-3xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run('submit');
        }}
        noValidate
      >
        {banner ? <ErrorState message={banner} /> : null}

        {general.length > 0 ? (
          <ErrorState message={general.join(' ')} />
        ) : null}

        <EventRequestFields form={form} set={set} errors={errors} />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Send className="size-4" aria-hidden="true" />
            {(isEdit ? editSubmit.isPending : createSubmit.isPending)
              ? 'Submitting…'
              : 'Submit for review'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void run('draft')}
          >
            <Save className="size-4" aria-hidden="true" />
            {(isEdit ? saveChanges.isPending : saveDraft.isPending)
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : 'Save as draft'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(isEdit ? `/organiser/${id}` : '/organiser')}
          >
            Cancel
          </Button>

          <p className="w-full text-xs text-ink-500">
            {isEdit
              ? 'You can save your changes at any point. Submitting for review requires all starred fields to be completed.'
              : 'You can save a draft with fields left empty. Submitting for review requires all starred fields to be completed.'}
          </p>
        </div>
      </form>
    </>
  );
}
