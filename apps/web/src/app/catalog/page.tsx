import React from 'react';
import Link from 'next/link';

export default function CatalogPage() {
  return (
    <div className="page-grid">
      <section className="page-intro" aria-labelledby="catalog-title">
        <p className="section-label">The collection</p>
        <h1 id="catalog-title">Browse games</h1>
        <p className="lede">A place for many games, one welcoming table. Game listings will appear here as their definitions are registered.</p>
        <Link className="text-link" href="/lobby">Visit the lobby <span aria-hidden="true">↗</span></Link>
      </section>
      <section className="empty-panel" aria-labelledby="catalog-empty-title">
        <div className="tile-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <div>
          <h2 id="catalog-empty-title">No games are available yet</h2>
          <p>The catalog will show games here once the first game is registered.</p>
        </div>
      </section>
    </div>
  );
}
