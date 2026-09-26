import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VenueDraftForm } from '@/features/venues/components/venue-draft-form';
import { PendingPhotosPicker } from '@/features/venues/components/pending-photos-picker';
import { venuesApi } from '@/features/venues/api/venues.api';

/** US-13 — the screen a Venue Staff member lands on to add a new venue. */
export function VenueNewRequest() {
    const navigate = useNavigate();
    const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);

    // Photos can only be uploaded once the venue actually exists (the upload
    // needs a real venue id), so anything picked before saving is staged
    // locally, then uploaded automatically the moment saving succeeds — from
    // the person's point of view, "add photos while creating" just works.
    const handleSaved = async (venueId: string) => {
        if (pendingPhotos.length > 0) {
            setUploadingPhotos(true);
            try {
                for (const file of pendingPhotos) {
                    await venuesApi.uploadImage(venueId, file);
                }
            } finally {
                setUploadingPhotos(false);
            }
        }
    };

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
                title="Add a venue"
                description="Save it as a draft any time — publish once it's ready for the catalogue."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Venue details</CardTitle>
                </CardHeader>
                <CardContent>
                    <VenueDraftForm onSaved={handleSaved} onPublished={() => navigate('/venues')} />
                </CardContent>
            </Card>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Photos</CardTitle>
                </CardHeader>
                <CardContent>
                    <PendingPhotosPicker onFilesChange={setPendingPhotos} />
                    {uploadingPhotos ? (
                        <p className="mt-2 text-sm text-ink-500">Uploading photos…</p>
                    ) : null}
                </CardContent>
            </Card>
        </>
    );
}