/** Covers the catalog, lobby, and table routes exposing clear destinations and empty states. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CatalogPage from './catalog/page.tsx';
import LobbyPage from './lobby/page.tsx';
import TablePage from './table/page.tsx';

test('catalog points players toward the lobby without inventing an available game', () => {
  const html = renderToStaticMarkup(createElement(CatalogPage));
  assert.match(html, /Browse games/);
  assert.match(html, /href="\/lobby"/);
  assert.match(html, /No games are available yet/);
});

test('lobby states that live rooms are not connected yet', () => {
  const html = renderToStaticMarkup(createElement(LobbyPage));
  assert.match(html, /Game lobby/);
  assert.match(html, /No live rooms yet/);
  assert.match(html, /href="\/catalog"/);
});

test('table presents a fixture preview without claiming a live game session', () => {
  const html = renderToStaticMarkup(createElement(TablePage));
  assert.match(html, /A table before the first turn/);
  assert.match(html, /Fixture preview/);
  assert.match(html, /Not connected to a game/);
  assert.match(html, /West path/);
  assert.match(html, /href="\/lobby"/);
});
