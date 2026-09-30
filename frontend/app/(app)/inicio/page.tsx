import type { Metadata } from 'next';
import { InicioRedirect } from '@/components/inicio/inicio-redirect';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.home.title };

export default function InicioPage() {
  return <InicioRedirect />;
}
