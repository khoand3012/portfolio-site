# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing
overview; this file is about conventions and invariants to preserve.

## What this is

A real person's CV/portfolio site (Truong Nam Nguyen). Content accuracy
matters — names, dates, job titles, and bullet points are factual claims
about someone's career, not filler copy.

## The one invariant: `dist/` is generated, and gitignored

This is an [Astro](https://astro.build) site, `output: 'static'`, no
adapter (see `astro.config.mjs`). `npm run build` (`astro build`) reads
`content/portfolio.json` (imported directly by `src/pages/index.astro`)
and the components in `src/components/`, and writes `dist/`. **Never
hand-edit anything in `dist/`** — it's gitignored and regenerated on every
Netlify deploy per `netlify.toml`.

- To change page **content**: edit `content/portfolio.json`.
- To change **layout/markup**: edit `src/pages/index.astro` or the relevant
  component in `src/components/`.
- To change **styling**: edit `src/styles/global.css` — one global
  stylesheet, not per-component scoped `<style>` blocks. Keep it that way;
  splitting styles across components is where visual regressions creep in
  for a page this size.

After any change, run `npm run build` and `npm run preview` to check it
before committing — but don't commit `dist/` itself.

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

## Keep `src/types.ts` in sync with `content/portfolio.json`

`src/types.ts`'s `PortfolioData` interface is a hand-maintained copy of
`content/portfolio.json`'s shape, cast onto the JSON import in
`src/pages/index.astro`. If you add/rename/remove a field in the JSON,
update `types.ts` and the corresponding component in `src/components/` (or
`index.astro` for top-level tab structure) in the same change — `astro
check`/`tsc` will not catch a JSON field that no longer matches the type
unless the type itself is updated too (the cast means TypeScript trusts the
annotation over the JSON's actual inferred shape).

## No admin panel — content is edited by hand

This repo previously had a Sveltia CMS admin panel (`public/admin/`) gated
behind a custom Google-sign-in OAuth broker (`netlify/functions/`), so a
non-technical editor could update content without touching code or Git. It
was removed at the site owner's request — see the "Remove Sveltia CMS and
related parts" commit for the full teardown. Don't re-add pieces of that
system (a `public/admin/` folder, `netlify/functions/`, `GITHUB_TOKEN` /
`GOOGLE_CLIENT_ID` / `ALLOWED_EMAILS`-shaped env vars) as a "helpful"
side effect of an unrelated change — if the user wants editor access back,
that's a deliberate feature request, not a default to restore.

## Biome: `.astro` files are excluded, and why

`biome.json`'s `files.includes` excludes `**/*.astro`. Biome's Astro support
(added v2.3, still experimental as of v2.5) doesn't see that a variable
destructured in a component's frontmatter (`const { job } = Astro.props`) is
used by the template markup below it — it reports nearly every props
destructure as `lint/correctness/noUnusedVariables`/`noUnusedImports`. This
was verified directly: running `biome check --write .` without the
exclusion deleted the actual `Astro.props` destructures and imports from
every component. **Do not remove this exclusion** without first running
`biome check --write` on a throwaway copy and diffing the result — if it's
still deleting used code, keep the exclusion. `package-lock.json`
(machine-generated; formatting it produces tens of thousands of
diagnostics) is excluded too.

Also: `biome.json` must be **strict JSON, no `//` comments** — Biome's
config parser rejects them outright, and does so by silently falling back
to full defaults (checking `node_modules`, every `.astro` file, tabs
instead of the configured spaces) rather than erroring loudly on
`biome check .` — only `biome check --config-path` on a single file
surfaces the actual parse error. If `biome check .` ever reports tens of
thousands of diagnostics again, check for a syntax error in `biome.json`
first.

## Design tokens are fixed

The color palette (navy blue / graphite grey / mint green / white, defined
as CSS custom properties in `src/styles/global.css`) was an explicit, deliberate
choice by the site owner. Don't change the hex values as a side effect of
an unrelated change — if a task calls for new UI, reuse the existing
`--navy-*`, `--graphite-*`, `--mint-*` tokens rather than introducing new
colors.
