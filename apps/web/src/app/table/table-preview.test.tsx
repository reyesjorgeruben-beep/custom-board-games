/** Covers the sample table projection and typed response capture without applying game rules. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPreviewSubmission, tablePreviewModel } from './table-fixture.ts';
import { TablePreview } from './table-preview.tsx';

test('fixture presentation carries the viewer snapshot and pending request into the table preview', () => {
  const request = tablePreviewModel.pendingDecisions[0];

  assert.ok(request);
  assert.equal(tablePreviewModel.tableId, 'sample-crossroads');
  assert.equal(tablePreviewModel.viewerId, 'sample-player');
  assert.equal(tablePreviewModel.stateVersion, 3);
  assert.equal(request.actorId, tablePreviewModel.viewerId);
  assert.equal(request.stateVersion, tablePreviewModel.stateVersion);
  assert.equal(tablePreviewModel.cards[1]?.face, 'back');
  assert.doesNotMatch(JSON.stringify(tablePreviewModel), /Hidden cache/);
});

test('preview capture echoes request correlation and leaves resolution to the host', () => {
  const request = tablePreviewModel.pendingDecisions[0];
  assert.ok(request);
  assert.equal(request.kind, 'chooseRoute');

  const submission = createPreviewSubmission(request, 'west');

  assert.deepEqual(submission, {
    decisionId: 'sample-route-choice',
    kind: 'chooseRoute',
    actorId: 'sample-player',
    stateVersion: 3,
    response: { route: 'west' },
  });
});

test('preview renders shared pieces and pending decision controls without hidden card content', () => {
  const html = renderToStaticMarkup(createElement(TablePreview));

  assert.match(html, /Crossroads board/);
  assert.match(html, /Wayfinder/);
  assert.match(html, /West path/);
  assert.match(html, /East path/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /Hidden cache/);
});
