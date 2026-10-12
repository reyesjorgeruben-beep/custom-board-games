import React from 'react';
import Link from 'next/link';

export default function LobbyPage() {
  return (
    <div className="page-grid">
      <section className="page-intro" aria-labelledby="lobby-title">
        <p className="section-label">Find your people</p>
        <h1 id="lobby-title">Game lobby</h1>
        <p className="lede">Rooms will appear here when the lobby connection is ready. Until then, you can explore the shape of the table.</p>
        <Link className="text-link" href="/catalog">Back to games <span aria-hidden="true">↗</span></Link>
      </section>
      <section className="empty-panel" aria-labelledby="lobby-empty-title">
        <div className="room-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <h2 id="lobby-empty-title">No live rooms yet</h2>
          <p>Room discovery and joining will be added after the coordination service is connected.</p>
        </div>
      </section>
    </div>
  );
}
