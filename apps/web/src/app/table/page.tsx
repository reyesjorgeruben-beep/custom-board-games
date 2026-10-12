import React from 'react';
import Link from 'next/link';
import { TablePreview } from './table-preview.tsx';

export default function TablePage() {
  return (
    <div className="table-page">
      <header className="table-page__heading">
        <div>
          <p className="table-page__eyebrow">Table sample</p>
          <h1 id="table-title">A table before the first turn</h1>
          <p className="table-page__lede">A fixture snapshot shows how a game can arrange shared pieces and present its own pending decision.</p>
        </div>
        <Link className="text-link" href="/lobby">Back to the lobby <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="table-page__status" role="status">
        <span className="table-page__status-dot" aria-hidden="true" />
        <span>Fixture preview</span>
        <span className="table-page__status-divider" aria-hidden="true" />
        <span>Not connected to a game</span>
      </div>

      <TablePreview />
    </div>
  );
}
