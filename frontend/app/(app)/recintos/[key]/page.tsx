import type { Metadata } from 'next';
import { RequirePermission } from '@/components/auth/require-permission';
import { RecintoDetailView } from '@/components/recintos/recinto-detail-view';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.recintos.detail.title };

export default async function RecintoDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return (
    <RequirePermission permission="recintos.assignCoordinator">
      <RecintoDetailView recintoKey={key} />
    </RequirePermission>
  );
}
