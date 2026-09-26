# Better Sweet Drinks feedback service

This Cloudflare Worker stores public recipe ratings and moderated comments in D1. It is independent of the GitHub repository visibility, so the website source can be private while the public site keeps its community features.

## One-time Cloudflare setup

1. Create a D1 database named `better-sweet-drinks-feedback`.
2. Copy its database ID into `feedback/wrangler.toml`.
3. In the `feedback` directory run `npm install`.
4. Apply the schema with `npm run db:remote`.
5. Create two Worker secrets:
   - `HASH_SALT`: a long random value used when hashing visitor IP/user-agent combinations.
   - `MODERATION_TOKEN`: a long random bearer token used to approve/reject comments.
6. Deploy with `npm run deploy`.
7. Route the Worker to `feedback.bettersweetdrinks.com` (recommended) or use its workers.dev URL.
8. Put that URL in `data/site.json -> feedback.endpoint` and set `feedback.enabled` to `true`.

## Moderation

New comments are stored as `pending` and never appear publicly until approved.

List pending comments:

```
GET /api/admin/comments?status=pending
Authorization: Bearer <MODERATION_TOKEN>
```

Approve one:

```
PATCH /api/admin/comments/123
Authorization: Bearer <MODERATION_TOKEN>
Content-Type: application/json

{"status":"approved"}
```

Reject one by sending `{"status":"rejected"}`.

## Privacy / abuse controls

The service does not store raw IP addresses. It stores a SHA-256 hash derived from IP + user agent + a secret salt. That hash is used to make ratings one-per-browser/network fingerprint per recipe and to apply a simple comment cooldown. Comments are plain text and the website inserts them using `textContent`, preventing submitted HTML from executing.

Do not add aggregateRating structured data until genuine public ratings exist.
