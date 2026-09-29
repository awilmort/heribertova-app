import type { Metadata } from 'next';
import { VoterLookup } from '@/components/padron/voter-lookup';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.padron.title };

export default function PadronPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{messages.padron.title}</h1>
        <p className="text-muted-foreground">{messages.padron.intro}</p>
      </div>
      <VoterLookup />
    </div>
  );
}
