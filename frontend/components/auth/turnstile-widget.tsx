'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
/** How often to check whether the Turnstile script has defined `window.turnstile`. */
const READY_POLL_MS = 100;

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile (plan 3.1's login API requires `turnstileToken`). Loaded with the page's CSP
 * nonce via `next/script`. `window.turnstile` is defined asynchronously once the script runs, so a
 * short poll (rather than relying on `next/script`'s `onLoad`, whose exact firing semantics aren't
 * part of its public contract) renders the widget as soon as it's available.
 */
export function TurnstileWidget({
  nonce,
  onToken,
}: {
  nonce: string;
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [ready, setReady] = useState(
    () => typeof window !== 'undefined' && Boolean(window.turnstile),
  );

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (ready) return;
    const id = window.setInterval(() => {
      if (window.turnstile) {
        setReady(true);
        window.clearInterval(id);
      }
    }, READY_POLL_MS);
    return () => window.clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.turnstile) return;
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(null),
      'error-callback': () => onTokenRef.current(null),
    });
    return () => window.turnstile?.remove(widgetId);
  }, [ready]);

  return (
    <>
      <Script src={TURNSTILE_SRC} strategy="afterInteractive" nonce={nonce} />
      <div ref={containerRef} />
    </>
  );
}
