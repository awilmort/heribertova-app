import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { messages } from '@/messages/es';

const text = messages.auth.passwordChange;

/** Persists on every page while `usingDefaultPassword` is true (plan 3.4). */
export function DefaultPasswordBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm sm:px-6"
    >
      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
      <span>{text.banner}</span>
      <Link href="/perfil" className="font-medium underline underline-offset-2">
        {text.bannerCta}
      </Link>
    </div>
  );
}
