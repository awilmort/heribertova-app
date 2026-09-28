import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { messages } from '@/messages/es';
import { Providers } from './providers';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: messages.app.title, template: `%s · ${messages.app.name}` },
  description: messages.app.description,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#8b6b4a',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP in proxy.ts uses a per-request nonce, which Next.js can only apply to dynamically
  // rendered pages; statically prerendered HTML would have its scripts blocked.
  await connection();

  return (
    <html lang="es-DO" className={poppins.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
