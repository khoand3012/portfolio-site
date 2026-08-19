# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing
overview; this file is about conventions and invariants to preserve.

## What this is

A real person's CV/portfolio site (Truong Nam Nguyen). Content accuracy
matters — names, dates, job titles, and bullet points are factual claims
about someone's career, not filler copy.

## The one invariant: `index.html` is generated

`index.html` is produced by `node build.js` from `content/portfolio.json`
and `src/head.html`. **Never hand-edit `index.html` directly** — edits will
be silently lost the next time someone runs the build. If you need to
change page content, edit `content/portfolio.json`. If you need to change
layout/CSS/markup structure, edit the render functions in `build.js` (and
`src/head.html` for anything in `<head>`, including all CSS).

After any change to `content/portfolio.json` or `build.js`, run:

```sh
node build.js
```

and commit the regenerated `index.html` alongside the source change — don't
leave the repo with `index.html` out of sync with its inputs.

## Content fidelity

When editing `content/portfolio.json` text on the user's behalf (as opposed
to the user editing it themselves), do not paraphrase, summarize, or
invent — copy exactly what you're given. This has bitten us before: an
earlier pass generated a design mockup via an AI tool (Stitch) that
silently reworded bullet points and invented a placeholder company name.
If you're ever tempted to have a generative tool (Stitch, an LLM prompt,
etc.) produce new copy for this page, treat its output as a *design*
reference only and reconcile the actual text by hand — see the git history
around the initial redesign for the reasoning.

## Keeping `admin/config.yml` and `content/portfolio.json` in sync

The Sveltia CMS config in `admin/config.yml` defines form fields by `name:`,
and those names must match `content/portfolio.json`'s keys exactly (same
nesting, same field names) or the CMS will silently fail to show/save data
correctly. If you add/rename/remove a field in the JSON schema, update
`admin/config.yml` to match in the same change, and update the
corresponding render logic in `build.js`.

A quick way to sanity-check they still agree: parse both with a script that
walks the YAML `fields` tree and the JSON object tree and diffs the field
names structurally (this was done once by hand when the CMS was first set
up — there's no committed script for it, so recreate the check if you're
unsure).

## CDN scripts need pinned versions + SRI

`admin/index.html` loads Sveltia CMS from unpkg. It's pinned to an exact
version with a `integrity="sha384-..."` hash — never switch to a floating
range like `@^1.0.0` for a script tag; SRI can't verify a moving target.
When bumping the version, recompute the hash for that exact file (see
README's "Updating the CMS script version" section) and update both values
together.

## Backend choice: `github`, not `git-gateway`

`admin/config.yml` uses `backend: name: github`. Do not switch this to
`git-gateway` — Netlify has deprecated Git Gateway for new setups (Identity
itself is still supported, but Git Gateway is not recommended going
forward). The `github` backend works without any of that: once this site
is hosted on Netlify, Netlify's built-in OAuth for the `github` backend
handles authentication with no extra proxy or serverless function needed.

## Design tokens are fixed

The color palette (navy blue / graphite grey / mint green / white, defined
as CSS custom properties in `src/head.html`) was an explicit, deliberate
choice by the site owner. Don't change the hex values as a side effect of
an unrelated change — if a task calls for new UI, reuse the existing
`--navy-*`, `--graphite-*`, `--mint-*` tokens rather than introducing new
colors.
