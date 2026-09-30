import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { messages } from '@/messages/es';

export const metadata: Metadata = { title: messages.errors.forbiddenTitle };

/** Shown when a signed-in user reaches a page their role has no permission for. */
export default function AccesoDenegadoPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{messages.errors.forbiddenTitle}</h1>
      <p className="text-muted-foreground">{messages.errors.forbiddenBody}</p>
      <Button asChild>
        <Link href="/inicio">{messages.errors.backHome}</Link>
      </Button>
    </div>
  );
}
