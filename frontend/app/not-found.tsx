import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { messages } from '@/messages/es';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={56} />
      <h1 className="text-2xl font-semibold">{messages.errors.notFoundTitle}</h1>
      <p className="text-muted-foreground">{messages.errors.notFoundBody}</p>
      <Button asChild>
        <Link href="/inicio">{messages.errors.backHome}</Link>
      </Button>
    </main>
  );
}
