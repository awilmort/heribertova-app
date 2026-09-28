import type { MetadataRoute } from 'next';
import { messages } from '@/messages/es';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.app.title,
    short_name: messages.app.name,
    description: messages.app.description,
    lang: 'es-DO',
    start_url: '/inicio',
    display: 'standalone',
    background_color: '#f5efe6',
    theme_color: '#8b6b4a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
