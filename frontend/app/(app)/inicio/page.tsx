import type { Metadata } from 'next';
import { ApiStatus } from '@/components/home/api-status';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.home.title };

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{messages.home.title}</h1>
        <p className="text-muted-foreground">{messages.home.welcome}</p>
      </div>
      <ApiStatus />
    </div>
  );
}
