/** Covers accessible table primitives and the shared selection and zoom boundaries. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionButton, ActionPanel, Board, BoardPiece, Card, Token } from './table-primitives.tsx';
import { clampTableZoom, toggleTableSelection } from './table-interactions.ts';
import { TableViewport } from './table-viewport.tsx';

const board = { id: 'crossroads', label: 'Crossroads', columns: 8, rows: 6 } as const;

test('board pieces are placed at the center of their declared grid coordinate', () => {
  const html = renderToStaticMarkup(createElement(Board, { model: board },
    createElement(BoardPiece, { board, position: { boardId: board.id, x: 2, y: 3 } },
      createElement(Card, { card: { id: 'north-gate', face: 'front', title: 'North gate' } })),
  ));

  assert.match(html, /aria-label="Crossroads board"/);
  assert.match(html, /data-columns="8"/);
  assert.match(html, /data-rows="6"/);
  assert.match(html, /left:31\.25%;top:58\.333333333333336%/);
  assert.match(html, /North gate/);
});

test('selectable cards expose their selected state and face-down cards hide their title', () => {
  const selectedCard = renderToStaticMarkup(createElement(Card, {
    card: { id: 'scout', face: 'front', title: 'Scout', selected: true },
    onSelect: () => undefined,
  }));
  const faceDownCard = renderToStaticMarkup(createElement(Card, {
    card: { id: 'hidden', face: 'back', title: 'Hidden cache' },
  }));

  assert.match(selectedCard, /aria-pressed="true"/);
  assert.match(selectedCard, /Scout/);
  assert.match(faceDownCard, /Face-down card/);
  assert.doesNotMatch(faceDownCard, /Hidden cache/);
});

test('selectable tokens announce their label and use the game supplied color', () => {
  const html = renderToStaticMarkup(createElement(Token, {
    token: { id: 'marker', label: 'Your marker', color: '#765a69', selected: true },
    onSelect: () => undefined,
  }));

  assert.match(html, /aria-label="Your marker"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /--token-color:#765a69/);
});

test('action panels provide a labeled region for game specific controls', () => {
  const html = renderToStaticMarkup(createElement(ActionPanel, {
    id: 'route-choice',
    title: 'Choose a direction',
    description: 'This preview captures a response only.',
  }, createElement(ActionButton, { variant: 'primary' }, 'Choose north')));

  assert.match(html, /aria-labelledby="route-choice-title"/);
  assert.match(html, /Choose a direction/);
  assert.match(html, /This preview captures a response only\./);
  assert.match(html, /type="button"/);
  assert.match(html, /Choose north/);
});

test('table viewport exposes accessible zoom controls and a live zoom level', () => {
  const html = renderToStaticMarkup(createElement(TableViewport, { label: 'Map view' },
    createElement(Board, { model: board }, 'Map pieces'),
  ));

  assert.match(html, /aria-label="Map view"/);
  assert.match(html, /aria-label="Table zoom controls"/);
  assert.match(html, /aria-label="Zoom out"/);
  assert.match(html, /aria-label="Zoom in"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /100%/);
});

test('selection toggles one piece at a time and zoom stays inside shared limits', () => {
  assert.equal(toggleTableSelection(null, 'card-1'), 'card-1');
  assert.equal(toggleTableSelection('card-1', 'card-1'), null);
  assert.equal(toggleTableSelection('card-1', 'token-1'), 'token-1');
  assert.equal(clampTableZoom(0.1), 0.75);
  assert.equal(clampTableZoom(1.25), 1.25);
  assert.equal(clampTableZoom(4), 1.5);
});
