import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Select, Textarea } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  useEquipmentCatalogueOptions,
  useSetTechnicalRequirements,
} from '@/features/events/hooks/use-events';
import { apiErrorMessage } from '@/lib/api-client';
import type { EquipmentRequirement, EventChangeEntry, EventRequest } from '@/types/api';
import { ARRANGEMENT_LABELS } from '../lib/change-format';
import { ManualCheckToggle } from './manual-check-toggle';

/**
 * US-28 AC-3 — the recorded requirements, read-only. Shared by the
 * Coordinator's view and the Technical Support view so both see the same thing.
 *
 * US-42: with `manualCheck`, the assigned Coordinator can tick free-text lines
 * as checked by hand. Catalogue lines are settled by reservations instead.
 */
export function TechnicalRequirementsView({
  event,
  manualCheck = false,
}: {
  event: EventRequest;
  manualCheck?: boolean;
}) {
  const requirements = event.equipmentRequirements ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Required equipment
        </h3>
        {requirements.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Equipment</th>
                  <th className="py-1 pr-3 font-medium">Quantity</th>
                  <th className="py-1 font-medium">Notes</th>
                  {manualCheck ? <th className="py-1 pl-3 font-medium">Checked by hand</th> : null}
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => (
                  <tr key={r.id} className="border-t border-ink-100">
                    <td className="py-1.5 pr-3 text-ink-900">{r.equipmentType}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-ink-900">{r.quantity}</td>
                    <td className="py-1.5 text-ink-500">{r.notes ?? '—'}</td>
                    {manualCheck ? (
                      <td className="py-1.5 pl-3">
                        {r.equipmentId ? (
                          <span className="text-xs text-ink-500">Settled by reservation</span>
                        ) : (
                          <ManualCheckToggle eventId={event.id} requirement={r} />
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-sm text-ink-500">None recorded.</p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Technical support needed
        </h3>
        <p className="mt-1 whitespace-pre-line text-sm text-ink-900">
          {event.technicalSupportNeeds ?? 'None recorded.'}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">
          Organiser's original request
        </h3>
        <p className="mt-1 text-sm text-ink-500">{event.equipmentNeeds ?? 'None given.'}</p>
      </div>
    </div>
  );
}

/** The dropdown's "Other" choice: a free-text line, not from the catalogue. */
const OTHER = '__other__';

interface Row {
  key: number;
  /** A catalogue item's id, OTHER, or '' while nothing is chosen. */
  choice: string;
  /** The free-text type when choice is OTHER; the saved name for a catalogue line. */
  equipmentType: string;
  quantity: string;
  notes: string;
}

let nextKey = 0;
const toRow = (r?: EquipmentRequirement): Row => ({
  key: nextKey++,
  choice: r ? (r.equipmentId ?? OTHER) : '',
  equipmentType: r?.equipmentType ?? '',
  quantity: r ? String(r.quantity) : '1',
  notes: r?.notes ?? '',
});

function TechnicalRequirementsForm({
  event,
  onSaved,
  onCancel,
}: {
  event: EventRequest;
  onSaved: (change: EventChangeEntry | null) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => (event.equipmentRequirements ?? []).map(toRow));
  const [support, setSupport] = useState(event.technicalSupportNeeds ?? '');
  const save = useSetTechnicalRequirements(event.id);
  const catalogue = useEquipmentCatalogueOptions();
  const items = catalogue.data ?? [];

  // A saved line whose item is no longer listed still shows as chosen, so the
  // form never hides what the event has now.
  const unlisted = new Map(
    rows
      .filter((row) => row.choice !== '' && row.choice !== OTHER && !items.some((item) => item.id === row.choice))
      .map((row) => [row.choice, row.equipmentType]),
  );

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // Blank rows are ignored rather than rejected: "Add item" then changing
  // your mind should not block the save.
  const filled = rows.filter((row) =>
    row.choice === OTHER ? row.equipmentType.trim() !== '' : row.choice !== '',
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        equipment: filled.map((row) => ({
          // The server names a catalogue line after its item; the type sent
          // here only has to be non-empty.
          ...(row.choice === OTHER
            ? { equipmentType: row.equipmentType.trim() }
            : {
                equipmentId: row.choice,
                equipmentType: items.find((item) => item.id === row.choice)?.type ?? row.equipmentType,
              }),
          quantity: Number(row.quantity),
          notes: row.notes.trim() || null,
        })),
        technicalSupportNeeds: support.trim() || null,
      },
      { onSuccess: (result) => onSaved(result.change) },
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-800">Required equipment</legend>

        {catalogue.isError ? (
          <p className="text-sm text-red-700">
            {apiErrorMessage(catalogue.error, 'Could not load the equipment catalogue.')}
          </p>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-ink-500">No equipment listed yet.</p>
        ) : null}

        {rows.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[1fr_5.5rem] gap-2 sm:grid-cols-[2fr_6rem_2fr_auto]">
            <div className="space-y-2">
              <Select
                aria-label={`Equipment item, row ${index + 1}`}
                value={row.choice}
                onChange={(e) => setRow(row.key, { choice: e.target.value })}
                disabled={catalogue.isPending}
              >
                <option value="">Choose from the catalogue…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.type}
                    {item.location ? ` — ${item.location}` : ''}
                  </option>
                ))}
                {[...unlisted].map(([id, type]) => (
                  <option key={id} value={id}>
                    {type}
                  </option>
                ))}
                <option value={OTHER}>Other (not in catalogue)…</option>
              </Select>
              {row.choice === OTHER ? (
                <Input
                  aria-label={`Equipment type, row ${index + 1}`}
                  placeholder="e.g. Laser projector"
                  value={row.equipmentType}
                  onChange={(e) => setRow(row.key, { equipmentType: e.target.value })}
                />
              ) : null}
            </div>
            <Input
              aria-label={`Quantity, row ${index + 1}`}
              type="number"
              min={1}
              value={row.quantity}
              onChange={(e) => setRow(row.key, { quantity: e.target.value })}
            />
            <Input
              aria-label={`Notes, row ${index + 1}`}
              placeholder="Notes (optional)"
              className="col-span-2 sm:col-span-1"
              value={row.notes}
              onChange={(e) => setRow(row.key, { notes: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="col-span-2 h-10 justify-self-end sm:col-span-1"
              aria-label={`Remove row ${index + 1}`}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((prev) => [...prev, toRow()])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add item
        </Button>
      </fieldset>

      <Field
        label="Technical support needed"
        htmlFor="tech-support"
        hint="e.g. on-site AV technician, hybrid / video-conferencing setup, livestream."
      >
        <Textarea
          id="tech-support"
          rows={3}
          value={support}
          onChange={(e) => setSupport(e.target.value)}
        />
      </Field>

      {save.error ? (
        <p className="text-sm text-red-700">
          {apiErrorMessage(save.error, 'Could not save these requirements.')}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save requirements'}
        </Button>
      </div>
    </form>
  );
}

/**
 * US-28 — the Coordinator's card: the recorded requirements, and, while the
 * event is in planning and assigned to them, the means to edit them.
 */
export function TechnicalRequirementsCard({
  event,
  editable,
}: {
  event: EventRequest;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [lastSave, setLastSave] = useState<EventChangeEntry | null | 'unchanged'>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipment and technical requirements</CardTitle>
        {editable && !editing ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setLastSave(null);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit requirements
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {lastSave && lastSave !== 'unchanged' && lastSave.requiresReview ? (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Saved, and <strong>flagged for review</strong>: this affects arrangements that are
              already confirmed ({lastSave.affectedArrangements.map((a) => ARRANGEMENT_LABELS[a]).join(', ')}).
            </span>
          </div>
        ) : null}
        {lastSave && lastSave !== 'unchanged' && !lastSave.requiresReview ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Requirements saved. Technical Support can now see them on this event.
          </div>
        ) : null}
        {lastSave === 'unchanged' ? (
          <p role="status" className="text-sm text-ink-500">
            Nothing changed, so nothing was saved.
          </p>
        ) : null}

        {editing ? (
          <TechnicalRequirementsForm
            event={event}
            onSaved={(change) => {
              setLastSave(change ?? 'unchanged');
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <TechnicalRequirementsView event={event} manualCheck={editable} />
        )}
      </CardContent>
    </Card>
  );
}
