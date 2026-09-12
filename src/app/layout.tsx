import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spatial Sketch — A little sketch. A new dimension.',
  description: 'An ephemeral sketch studio for editable architectural forms. Draw, shape, and explore directly in your browser.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f5f4ed' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
