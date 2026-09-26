# Visitor comments and recipe ratings

Better Sweet Drinks is currently deployed as a static GitHub Pages site. Static pages cannot safely store shared comments or aggregate star ratings by themselves, so both features need a small persistent service.

## Comments

Recommended provider: **Giscus**, because the repository is already public and the site is built from GitHub.

The article template already contains a Giscus integration behind `data/site.json -> feedback.comments.enabled`.

To activate it:

1. Enable **GitHub Discussions** for `dimitarpdwork-tech/bettersweetdrinks`.
2. Install/authorize the Giscus GitHub App for the repository.
3. Create a discussion category such as **Recipe comments**.
4. Copy the repository ID and category ID from the Giscus setup page into `data/site.json`.
5. Set `feedback.comments.enabled` to `true`.

Comments then appear on recipe articles and are stored as GitHub Discussions. Visitors need a GitHub account to comment, which gives useful abuse/spam protection but adds login friction.

## Ratings

A genuine community 1–5 star rating needs shared storage. A localStorage-only rating was intentionally not used because it would look like community data while only existing in one visitor's browser.

The front-end rating component is already implemented and is enabled by setting:

- `feedback.ratings.enabled: true`
- `feedback.ratings.endpoint: https://...`

Expected API:

### GET

`GET <endpoint>?slug=halloween-blackberry-witch-fizz`

Response:

```json
{"average":4.6,"count":27}
```

### POST

```json
{"slug":"halloween-blackberry-witch-fizz","rating":5}
```

Response:

```json
{"average":4.7,"count":28}
```

A Cloudflare Worker + KV/D1 or a small Supabase project is suitable. The API should enforce allowed origins, validate a 1–5 integer, rate-limit submissions and prevent obvious repeat-vote abuse.

## Why the features are disabled by default

GitHub Pages does not run server-side code. Enabling either feature without its external persistence/configuration would create a broken or misleading UI, so the repository contains the production-ready front-end hooks but does not expose them until the backing service is configured.
