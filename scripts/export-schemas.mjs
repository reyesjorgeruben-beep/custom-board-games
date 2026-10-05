import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  decisionRequestEnvelopeSchema,
  decisionSubmissionEnvelopeSchema,
  playerSnapshotEnvelopeSchema,
  roomSummarySchema,
  signalMessageSchema,
  visibilityAudienceSchema,
} from '../packages/protocol/src/index.ts';

const definitions = {
  DecisionRequestEnvelope: decisionRequestEnvelopeSchema,
  DecisionSubmissionEnvelope: decisionSubmissionEnvelopeSchema,
  PlayerSnapshotEnvelope: playerSnapshotEnvelopeSchema,
  RoomSummary: roomSummarySchema,
  SignalMessage: signalMessageSchema,
  VisibilityAudience: visibilityAudienceSchema,
};

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/reyesjorgeruben-beep/custom-board-games/blob/main/docs/contracts.schema.json',
  title: 'Custom Board Games shared protocol schemas',
  description: 'Decision context, response, and player view are supplied by each registered game.',
  $defs: Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
    const { $schema, ...body } = z.toJSONSchema(definition);
    void $schema;
    return [name, body];
  })),
};

const path = new URL('../docs/contracts.schema.json', import.meta.url);
const content = `${JSON.stringify(schema, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const existing = await readFile(path, 'utf8');
  if (existing !== content) {
    console.error('docs/contracts.schema.json is stale. Run npm run schema:export.');
    process.exitCode = 1;
  }
} else {
  await writeFile(path, content);
  console.log('Wrote docs/contracts.schema.json');
}
