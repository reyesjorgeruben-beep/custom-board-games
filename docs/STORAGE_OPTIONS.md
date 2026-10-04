# Coordination storage options

**Status:** Proposal for review, not an accepted provider decision  
**Date:** 2026-10-04

## What needs storage now

- Game definitions and catalog metadata live in this repository and can ship with the web app.
- The host browser owns complete authoritative game state. Guest browsers receive only player-specific projections.
- The shared service needs short-lived room discovery, presence, and WebRTC signaling messages. These records should expire when a room closes or the host leaves.
- Player accounts, saved matches, and durable recovery are later requirements. Their storage should be chosen when their access patterns are known.

## Recommended initial provider: Cloudflare

Use a Worker as the coordination API, one Durable Object for the room directory, and a SQLite-backed Durable Object per active room for signaling and presence. Use WebSocket hibernation for idle connections. Do not put game secrets or authoritative match state in these objects.

Cloudflare's Workers Free plan supports SQLite-backed Durable Objects. Its documented free limits include 100,000 Durable Object requests and 13,000 GB-s per day, plus 5 GB total SQLite storage; operations above a Free limit fail rather than incur an overage charge. Inactive objects do not incur duration charges, and WebSocket hibernation avoids duration charges while a room is idle. This is a closer fit than a time-limited signup credit for a hobby project that may sit unused. The documentation does not promise that every account remains active indefinitely, so this is a cost and architecture recommendation, not a service guarantee. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

## AWS alternative

On AWS, use API Gateway WebSocket APIs for signaling, Lambda for handlers, and DynamoDB records with expiry for rooms. This is feasible and keeps game logic in the host browser. It introduces more deployed services and a less predictable free runway: the documented API Gateway WebSocket allowance is for up to 12 months for new customers, while AWS's current new-account free plan/credits have a separate time limit. DynamoDB and Lambda have their own free quotas, but those do not make the complete signaling stack permanently free. [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/), [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/), [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/), [Lambda pricing](https://aws.amazon.com/lambda/pricing/)

## Decision point

Choose Cloudflare if the priority is a small, low-maintenance room service with a free plan that has no documented weekly inactivity pause. Choose AWS if existing AWS familiarity and infrastructure are more valuable than the extra services and eventual metered costs. Either choice implements the same coordination interface and keeps the engine and game SDK provider-independent.
