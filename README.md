# Better Sweet Drinks

Static migration of the existing WordPress website. This is a migration candidate, not a deployed site.

## Build locally

Use Python 3.12 and run:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python scripts/build.py
python scripts/verify.py
python -m http.server 8000 --directory dist
```

Open http://localhost:8000. Preview builds block search indexing. Generated files are in `dist/` and are not committed.

## Content and editor

Articles and pages are Markdown in `content/posts` and `content/pages`; front matter controls titles, URLs, authors, dates, categories and images. Recipe cards are JSON in `content/recipes` and are linked by `recipeIds`. Existing image paths are preserved. Historical comments include only public author names, dates and text.

Original WordPress images are bundled in `assets/legacy-media-*.zip` for the initial migration. The build extracts them into their original public paths, so visitors receive normal images with no client-side unpacking. New editor uploads are ordinary files in `public/images/uploads`. Local extracted legacy images are ignored by Git; the archives are the tracked source.

The Sveltia editor at `/admin/` activates when `GITHUB_REPOSITORY` is set by GitHub Actions or `repository` is filled in `data/site.json`. It uses GitHub token authentication, like the referenced App-Tipps setup. Never commit tokens. Recipe instructions use HTML in the current editor. Nutrition records remain in JSON; edit them in source if needed.

## Publish a preview

Repository: `dimitarpdwork-tech/bettersweetdrinks`. Select GitHub Actions as its Pages build source. The **Check website** workflow builds and verifies changes. **Publish website** builds a preview automatically when `main` changes, with indexing disabled and no custom domain. The preview destination is `https://dimitarpdwork-tech.github.io/bettersweetdrinks`. A manual run can override the destination and production flag. No workflow changes DNS.

After preview approval, run the publish workflow with `https://bettersweetdrinks.com` and production checked, then configure the domain. Cloudflare Pages can also build this source using `pip install -r requirements.txt && python scripts/build.py && python scripts/verify.py`, output directory `dist`, and the matching environment variables.

## Before launch

- Check the contact page: the old Contact Form 7 form cannot run on static hosting. A public email or replacement form service is still needed.
- Review the inherited privacy policy for the new static setup.
- Review `verification-report.json` for unresolved links inherited from original articles.
- Confirm desktop/mobile appearance and approve the preview before changing DNS.
- Existing WordPress accounts, passwords, plugins, database dumps, spam and private drafts are excluded. The original Drive backup remains the source archive.

GitHub Pages redirects use HTML refresh and canonical URLs; Cloudflare Pages also supports the generated `_redirects` file with HTTP 301 rules.

`migration-report.json` records recovered content counts and original URLs. `verification-report.json` records the latest local checks.
