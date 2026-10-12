import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Custom Board Games', template: '%s | Custom Board Games' },
  description: 'Find a game, gather at a table, and play together.',
};

const destinations = [
  { href: '/catalog', label: 'Games' },
  { href: '/lobby', label: 'Lobby' },
  { href: '/table', label: 'Table' },
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-frame">
          <header className="site-header">
            <Link className="brand" href="/catalog" aria-label="Custom Board Games, catalog">
              <span className="brand-symbol" aria-hidden="true">✳</span>
              <span>Custom Board Games</span>
            </Link>
            <nav aria-label="Main navigation">
              {destinations.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
          </header>
          <main id="main-content" className="site-main">{children}</main>
          <footer className="site-footer">
            <span>Find a game. Gather around.</span>
            <span>Made for a shared table.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
