import React from 'react';
import Link from 'next/link';

export default function TablePage() {
  return (
    <div className="page-grid">
      <section className="page-intro" aria-labelledby="table-title">
        <p className="section-label">Take a seat</p>
        <h1 id="table-title">Game table</h1>
        <p className="lede">This is where a room will become a shared game. Each player will see only their own view and decisions.</p>
        <Link className="text-link" href="/lobby">Go to the lobby <span aria-hidden="true">↗</span></Link>
      </section>
      <section className="empty-panel" aria-labelledby="table-empty-title">
        <div className="table-mark" aria-hidden="true"><span /></div>
        <div>
          <h2 id="table-empty-title">No table is active</h2>
          <p>Join a room to enter a table once live sessions are available.</p>
        </div>
      </section>
    </div>
  );
}
