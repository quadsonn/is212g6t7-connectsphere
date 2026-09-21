import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VenueDraftForm } from '@/features/venues/components/venue-draft-form';

/** US-13 — the screen a Venue Staff member lands on to add a new venue. */
export function VenueNewRequest() {
    const navigate = useNavigate();

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
                    <VenueDraftForm onPublished={() => navigate('/venues')} />
                </CardContent>
            </Card>
        </>
    );
}