# Visitor comments and recipe ratings

Better Sweet Drinks now uses a repository-independent feedback architecture.

The public website remains static, but comments and ratings are stored by a small Cloudflare Worker backed by D1. This means the GitHub repository may be public or private without changing how visitors rate or comment on recipes.

## Visitor experience

Each recipe can show:

- an aggregate 1–5 star rating;
- one rating per visitor fingerprint per recipe (a later vote updates the previous vote);
- a comment form using name + comment;
- approved reader comments.

New comments are moderated before publication.

## Backend

Implementation: `feedback/`.

The Worker exposes public recipe feedback endpoints and authenticated moderation endpoints. See `feedback/README.md` for deployment, D1 setup and moderation instructions.

## Activation

The UI is deliberately hidden until the Worker has been deployed. After deployment, set:

```json
"feedback": {
  "enabled": true,
  "provider": "cloudflare-worker-d1",
  "endpoint": "https://feedback.bettersweetdrinks.com"
}
```

Do not enable it before the endpoint works, otherwise recipe pages would expose a broken form.

## Structured data

Do not add `aggregateRating` to Recipe schema until real reader ratings exist. Once enough legitimate ratings have accumulated, the build can be extended to fetch/publish verified aggregate values.
