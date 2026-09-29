import type { Metadata } from 'next';
import { PerfilView } from '@/components/perfil/perfil-view';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.perfil.title };

export default function PerfilPage() {
  return <PerfilView />;
}
