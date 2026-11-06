import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'BondMoran Hiring Partnership', description: 'Prototype using fictional data. Powered by Elsewhere.', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
