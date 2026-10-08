import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/states';
import { VenueDraftForm } from '@/features/venues/components/venue-draft-form';
import { useVenue } from '@/features/venues/hooks/use-venues';
import { apiErrorMessage } from '@/lib/api-client';
import { useRef } from 'react';
import { VenueImageCarousel } from '@/features/venues/components/venue-image-carousel';
import { useRemoveVenueImage, useUploadVenueImage } from '@/features/venues/hooks/use-venues';

/** US-14 — edit an existing venue's details. */
export function VenueEditRequest() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: venue, isPending, isError, error } = useVenue(id ?? '');

    return (
        <>
            <Button
                variant="ghost"
                onClick={() => navigate('/venues')}
                className="mb-4 -ml-2 gap-1.5 text-ink-600 hover:text-ink-900"
            >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to venue catalogue
            </Button>

            <PageHeader
                title="Edit venue"
                description="Changes are reflected in the catalogue as soon as you save or publish."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Venue details</CardTitle>
                </CardHeader>
                <CardContent>
                    {isPending ? <p className="text-sm text-ink-500">Loading…</p> : null}
                    {isError ? (
                        <ErrorState message={apiErrorMessage(error, 'Could not load this venue.')} />
                    ) : null}
                    {venue ? (
                        <>
                            <VenueDraftForm
                                venueId={venue.id}
                                initialValues={venue}
                                initialStatus={venue.status}
                                onPublished={() => navigate('/venues')}
                            />

                            <div className="mt-8 border-t border-ink-100 pt-6">
                                <h3 className="mb-3 text-sm font-semibold text-ink-800">Photos</h3>
                                <VenueImagesEditor venueId={venue.id} images={venue.imageUrls} />
                            </div>
                        </>
                    ) : null}
                </CardContent>
            </Card>
        </>
    );
}

function VenueImagesEditor({ venueId, images }: { venueId: string; images: string[] }) {
    const fileInput = useRef<HTMLInputElement>(null);
    const upload = useUploadVenueImage(venueId);
    const remove = useRemoveVenueImage(venueId);

    return (
        <div className="space-y-3">
            <VenueImageCarousel images={images} onRemove={(url) => remove.mutate(url)} />
            <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    for (const file of files) {
                        await upload.mutateAsync(file);
                    }
                    e.target.value = '';
                }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? 'Uploading…' : 'Upload photo'}
            </Button>
        </div>
    );
}