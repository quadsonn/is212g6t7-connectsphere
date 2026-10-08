import { PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

/**
 * Landing page for a role whose screens are not built yet (requirement
 * changes 5 and 6). It exists so signing in lands somewhere real: without a
 * route at the role's home, the catch-all redirect would loop.
 */
export function RolePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          title="Coming soon"
          description="This role's screens are being built. You are signed in with the correct role."
        />
      </Card>
    </>
  );
}
