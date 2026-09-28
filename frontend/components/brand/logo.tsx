import Image from 'next/image';
import { messages } from '@/messages/es';

/** Horizontal lockup (mark + "Heriberto / SANTANA · HIGÜEY"). Source: brand/logo-horizontal.svg. */
export function LogoHorizontal({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/logo-horizontal.svg"
      alt={messages.app.logoAlt}
      width={760}
      height={170}
      priority={priority}
      className={className}
    />
  );
}

/** The H-with-check mark alone, for tight spaces. Source: brand/logo-mark.svg. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/logo-mark.svg"
      alt={messages.app.logoAlt}
      width={size}
      height={size}
      className={className}
    />
  );
}
