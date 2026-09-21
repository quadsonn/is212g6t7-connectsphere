import { VenueDraftForm } from '@/features/venues/components/venue-draft-form';

export function NewVenuePage() {
    return (
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-6 text-xl font-semibold">Add a venue</h1>
            <VenueDraftForm />
        </div>
    );
}