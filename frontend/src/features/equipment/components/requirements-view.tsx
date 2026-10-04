import type { EventRequirements } from '@/types/api';

function RequirementSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">{title}</h3>
      {children}
    </section>
  );
}

function NoneRecorded() {
  return <p className="text-sm text-ink-500">None recorded.</p>;
}

/**
 * US-31 — an event's equipment and technical requirements from all three
 * sources (AC-1/AC-2), or the "none recorded" message when it has none
 * (AC-3). Shared by the requirements page and the "View more details" page.
 */
export function RequirementsView({ requirements }: { requirements: EventRequirements }) {
  if (!requirements.hasRequirements) {
    // AC-3: clearly indicated, not blank.
    return (
      <p
        role="note"
        className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700"
      >
        {requirements.message}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <RequirementSection title="Equipment needs (from the Organiser)">
        {requirements.organiserEquipmentNeeds ? (
          <p className="whitespace-pre-line text-sm text-ink-900">
            {requirements.organiserEquipmentNeeds}
          </p>
        ) : (
          <NoneRecorded />
        )}
      </RequirementSection>

      <RequirementSection title="Equipment requirements (from the Coordinator)">
        {requirements.coordinatorRequirements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Equipment the Coordinator recorded, with quantity and notes
              </caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Equipment</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Quantity</th>
                  <th scope="col" className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {requirements.coordinatorRequirements.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-4 font-medium text-ink-900">{row.equipmentType}</td>
                    <td className="py-2 pr-4 tabular-nums text-ink-700">{row.quantity}</td>
                    <td className="py-2 text-ink-600">{row.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <NoneRecorded />
        )}
      </RequirementSection>

      <RequirementSection title="Technical support notes (from the Coordinator)">
        {requirements.technicalSupportNeeds ? (
          <p className="whitespace-pre-line text-sm text-ink-900">
            {requirements.technicalSupportNeeds}
          </p>
        ) : (
          <NoneRecorded />
        )}
      </RequirementSection>
    </div>
  );
}
