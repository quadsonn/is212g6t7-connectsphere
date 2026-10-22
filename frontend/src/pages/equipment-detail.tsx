import { ArrowLeft } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LinkButton } from '@/components/ui/link-button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { EquipmentStatusPanel } from '@/features/equipment/components/equipment-status-panel';
import { useEquipmentItem } from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import { EQUIPMENT_STATUS_STYLES } from '@/lib/status';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/**
 * US-29 AC-2 — one item's full detail, including operational status.
 * US-45 — opened from the catalogue, and where its status is changed.
 */
export function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: item, isPending, isError, error } = useEquipmentItem(id ?? '');

  return (
    <>
      <PageHeader
        title={item?.type ?? 'Equipment item'}
        description="Everything recorded for this item."
        action={
          <LinkButton to="/equipment/inventory" variant="secondary" size="sm">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to catalogue
          </LinkButton>
        }
      />

      {isPending ? <LoadingState label="Loading item…" /> : null}

      {isError ? (
        <ErrorState message={apiErrorMessage(error, 'Could not load this item.')} />
      ) : null}

      {item ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <Badge
                className={EQUIPMENT_STATUS_STYLES[item.operationalStatus].className}
                srPrefix="Status"
              >
                {EQUIPMENT_STATUS_STYLES[item.operationalStatus].label}
              </Badge>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Type">{item.type}</Field>
              <Field label="Total quantity">{item.totalQuantity}</Field>
              <Field label="Location">{item.location ?? 'Not recorded'}</Field>
              <div className="sm:col-span-2">
                <Field label="Description">{item.description ?? 'Not recorded'}</Field>
              </div>
            </CardContent>
          </Card>

          <EquipmentStatusPanel item={item} />
        </div>
      ) : null}
    </>
  );
}
