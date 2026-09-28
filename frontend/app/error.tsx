'use client';

import { Button } from '@/components/ui/button';
import { messages } from '@/messages/es';

/** Error boundary for any page: shows a friendly message and lets the user retry the render. */
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      role="alert"
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <p className="text-lg">{messages.errors.generic}</p>
      <Button onClick={reset}>{messages.errors.retry}</Button>
    </main>
  );
}
