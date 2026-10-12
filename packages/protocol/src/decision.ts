import { z } from 'zod';

export type DecisionMap = Record<string, { context: unknown; response: unknown }>;
export type DecisionKind<M extends DecisionMap> = keyof M & string;

export type DecisionRequestFor<M extends DecisionMap, K extends DecisionKind<M>> = {
  id: string;
  tableId: string;
  kind: K;
  actorId: string;
  stateVersion: number;
  context: M[K]['context'];
};

export type DecisionRequest<M extends DecisionMap> = {
  [K in DecisionKind<M>]: DecisionRequestFor<M, K>;
}[DecisionKind<M>];

export type DecisionSubmissionFor<M extends DecisionMap, K extends DecisionKind<M>> = {
  decisionId: string;
  kind: K;
  actorId: string;
  stateVersion: number;
  response: M[K]['response'];
};

export type DecisionSubmission<M extends DecisionMap> = {
  [K in DecisionKind<M>]: DecisionSubmissionFor<M, K>;
}[DecisionKind<M>];

export type DecisionCodecs<M extends DecisionMap> = {
  [K in DecisionKind<M>]: {
    context: z.ZodType<M[K]['context']>;
    response: z.ZodType<M[K]['response']>;
  };
};

export type DecisionMapOfCodecs<C extends Record<string, { context: z.ZodType; response: z.ZodType }>> = {
  [K in keyof C]: {
    context: z.infer<C[K]['context']>;
    response: z.infer<C[K]['response']>;
  };
};

export const decisionRequestEnvelopeSchema = z.strictObject({
  id: z.string().min(1),
  tableId: z.string().min(1),
  kind: z.string().min(1),
  actorId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  context: z.unknown(),
});

export const decisionSubmissionEnvelopeSchema = z.strictObject({
  decisionId: z.string().min(1),
  kind: z.string().min(1),
  actorId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  response: z.unknown(),
});

export function createDecisionProtocol<const C extends Record<string, { context: z.ZodType; response: z.ZodType }>>(codecs: C) {
  type M = DecisionMapOfCodecs<C>;
  function codecFor(kind: string) {
    if (!Object.prototype.hasOwnProperty.call(codecs, kind)) {
      throw new Error(`Unknown decision kind: ${kind}`);
    }
    return codecs[kind as keyof C & string]!;
  }

  return {
    codecs,
    parseRequest(input: unknown): DecisionRequest<M> {
      const envelope = decisionRequestEnvelopeSchema.parse(input);
      const context = codecFor(envelope.kind).context.parse(envelope.context);
      return { ...envelope, context } as DecisionRequest<M>;
    },
    parseSubmission(input: unknown): DecisionSubmission<M> {
      const envelope = decisionSubmissionEnvelopeSchema.parse(input);
      const response = codecFor(envelope.kind).response.parse(envelope.response);
      return { ...envelope, response } as DecisionSubmission<M>;
    },
  };
}
