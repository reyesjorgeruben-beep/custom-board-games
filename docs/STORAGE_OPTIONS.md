# Coordination storage options

**Status:** AWS selected for initial coordination; implementation details remain open  
**Date:** 2026-10-04

## What needs storage now

- Game definitions and catalog metadata live in this repository and can ship with the web app.
- The host browser owns complete authoritative game state. Guest browsers receive only player-specific projections.
- The shared service needs short-lived room discovery, presence, and WebRTC signaling messages. These records should expire when a room closes or the host leaves.
- Player accounts, saved matches, and durable recovery are later requirements. Their storage should be chosen when their access patterns are known.

## Selected initial provider: AWS

Use a Lambda Function URL as a small HTTPS coordination API and DynamoDB Standard tables with provisioned capacity for short-lived room records and signaling messages. The lobby can query available rooms; peers can exchange WebRTC offers, answers, and ICE candidates through bounded HTTP polling during connection setup. Avoid continuous polling after the peer connection is established. The host browser still owns the game state, and the coordination service must never store hidden game data.

This design deliberately avoids API Gateway WebSocket APIs. The [Lambda Function URL endpoint has no separate endpoint charge](https://docs.aws.amazon.com/lambda/latest/dg/furls-http-invoke-decision.html); invocations and compute count against [Lambda's ongoing monthly free allowance](https://aws.amazon.com/lambda/pricing/). [DynamoDB's always-free allowance](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/) applies to Standard tables with provisioned read/write capacity and storage, not arbitrary on-demand usage. Keep requests, storage, outbound transfer, and any other enabled services within their own allowances. On an AWS Paid plan, usage beyond free allowances can incur charges. The new-account Free plan expires, but that does not end the separate Always Free offers on a Paid plan. [AWS Free Tier FAQ](https://aws.amazon.com/free/free-tier-faqs/)

Function URLs are public when configured without IAM authentication, so the application must validate requests, use unguessable room capabilities, bound polling and payload sizes, and prevent untrusted guests from reading other rooms' signaling messages. The exact room authentication and abuse controls are an open design topic. [Function URL access control](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html)

## Cloudflare alternative

Use a Worker as the coordination API, one Durable Object for the room directory, and a SQLite-backed Durable Object per active room for signaling and presence. Use WebSocket hibernation for idle connections. Do not put game secrets or authoritative match state in these objects.

Cloudflare's Workers Free plan supports SQLite-backed Durable Objects. Its documented free limits include 100,000 Durable Object requests and 13,000 GB-s per day, plus 5 GB total SQLite storage; operations above a Free limit fail rather than incur an overage charge. Inactive objects do not incur duration charges, and WebSocket hibernation avoids duration charges while a room is idle. The documentation does not promise that every account remains active indefinitely. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

Inactivity can evict an object's **in-memory** state, but SQLite data written through the Storage API survives eviction and restart. Cloudflare documents this distinction; it does not describe a Supabase-style weekly inactivity purge for Durable Object storage. We should still expire room records intentionally and keep any future long-lived data backed up. [Storage guidance](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), [lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)

## Why API Gateway WebSockets are not in the AWS first version

AWS's [API Gateway WebSocket free allowance](https://aws.amazon.com/api-gateway/pricing/) is limited to the first 12 months for new customers. That specific service would not meet the goal of ongoing zero-cost use merely by staying under its initial traffic allowance. We can reconsider it if real-time coordination becomes valuable enough to accept metered charges. Either AWS or Cloudflare implements the same coordination interface and leaves the engine and game SDK provider-independent.
