import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { ConditionSummary } from '@/features/equipment/components/equipment-condition';
import {
  useEquipmentCatalogue,
  useEquipmentConditions,
} from '@/features/equipment/hooks/use-equipment';
import { apiErrorMessage } from '@/lib/api-client';
import type { BrowseEquipmentQuery } from '@/types/api';

/** US-29 — REAL data, GET /equipment. */
export function EquipmentCatalogue() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BrowseEquipmentQuery['sortBy']>('type');
  const [sortOrder, setSortOrder] = useState<BrowseEquipmentQuery['sortOrder']>('asc');
  const navigate = useNavigate();

  // US-45: units by condition, matched to each row by id.
  const conditions = useEquipmentConditions();
  const conditionOf = new Map((conditions.data ?? []).map((c) => [c.equipmentId, c]));
  const { data: items, isPending, isError, error } = useEquipmentCatalogue({
    // Sent to the server, which does the filtering — not a client-side filter
    // over a partial list (AC-3).
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
  });

  return (
    <>
      <PageHeader
        title="Equipment catalogue"
        description="Everything on the shelf, and where to find it. Select an item to see or change its status."
      />

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Look up by type"
                aria-label="Look up equipment by type"
                className="w-56 pl-8"
              />
            </div>

            <label className="sr-only" htmlFor="equipment-sort">
              Sort equipment by
            </label>
            <div className="relative">
              <select
                id="equipment-sort"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as BrowseEquipmentQuery['sortBy'])
                }
                className="h-10 appearance-none rounded-lg border border-ink-300 bg-white py-0 pl-3 pr-9 text-sm text-ink-900"
              >
                <option value="type">Type</option>
                <option value="location">Location</option>
                <option value="totalQuantity">Total quantity</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
            </div>

            {/* AC-3: "via sorting" — direction, not just field. */}
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              aria-label={
                sortOrder === 'asc'
                  ? 'Sorted ascending — click to sort descending'
                  : 'Sorted descending — click to sort ascending'
              }
              className="flex h-10 items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-600 hover:bg-ink-50"
            >
              {sortOrder === 'asc' ? (
                <ArrowUp className="size-4" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-4" aria-hidden="true" />
              )}
              {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </button>
          </div>
        </CardHeader>

        {isPending ? <TableSkeleton /> : null}

        {isError ? (
          <CardContent>
            <ErrorState message={apiErrorMessage(error, 'Could not load the catalogue.')} />
          </CardContent>
        ) : null}

        {items && items.length === 0 ? (
          <EmptyState
            title={search ? 'No equipment matches that search' : 'No equipment yet'}
            description={
              search
                ? 'Try a different type, or clear the search to see the whole catalogue.'
                : 'Equipment added to the catalogue will be listed here.'
            }
          />
        ) : null}

        {items && items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Equipment catalogue with total quantity and location
              </caption>
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Type</th>
                  <th scope="col" className="px-5 py-3 font-medium">Description</th>
                  {/* Total owned, not free right now — availability depends on a date
                      and time, which is what Check availability is for. */}
                  <th scope="col" className="px-5 py-3 font-medium">Total quantity</th>
                  {/* US-45: how many of those work, are damaged, or are under maintenance. */}
                  <th scope="col" className="px-5 py-3 font-medium">Condition</th>
                  <th scope="col" className="px-5 py-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="group cursor-pointer transition-colors hover:bg-ink-50"
                    onClick={() => navigate(`/equipment/inventory/${item.id}`)}
                  >
                    {/* AC-2: a real link, so an item can be opened from the keyboard too. */}
                    <td className="px-5 py-3.5 font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
                      <Link
                        to={`/equipment/inventory/${item.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.type}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{item.description ?? '—'}</td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-600">{item.totalQuantity}</td>
                    <td className="px-5 py-3.5">
                      <ConditionSummary condition={conditionOf.get(item.id)} />
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{item.location ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  );
}
