# Next.js + Live Puck/Puck AI Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate truong-nam-portfolio from Astro to Next.js, then add a live, Google-OAuth-gated admin panel where Puck (including Puck AI, scaffolding-only) edits portfolio content stored in Netlify Blobs.

**Architecture:** Three phases, each independently shippable. Phase 1 ports the site to Next.js (App Router) with zero behavior change, converting `content/portfolio.json` to a block-based model. Phase 2 moves content into Netlify Blobs (with timestamped history snapshots) and adds Google-OAuth-gated `/admin` access with a bare JSON editor, proving the persistence + auth path end-to-end before Puck touches it. Phase 3 replaces the bare editor with a real per-tab Puck editor (config built from the same components the public site renders) plus Puck AI, restricted to scaffolding via its `context` prompt.

**Tech Stack:** Next.js (App Router), React, TypeScript, Vitest + React Testing Library, NextAuth.js (Auth.js) v5, `@netlify/blobs`, `@netlify/plugin-nextjs`, `@puckeditor/core`, `@puckeditor/plugin-ai`, `@puckeditor/cloud-client`, Biome.

**Spec:** `docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md`

## Global Constraints

- Exact visual parity: every converted component must produce the same markup/class names as its `.astro` predecessor so `src/styles/global.css` (fixed navy/graphite/mint tokens) applies unchanged. Never edit `global.css` as part of this plan.
- Content fidelity: no step in this plan may reword, paraphrase, or invent real content. The migration script (Task 2) must copy strings verbatim; Puck AI (Task 18) must be restricted to scaffolding only via its `context` config, never given an affordance to rewrite existing prose.
- `.env` is off-limits to view/edit/delete by an agent (existing project rule) — whenever a task needs a new env var, tell the user its name and value/how to generate it; do not touch `.env` directly.
- No new production surface without auth: any admin/editing route or API must be gated by a valid, allow-listed session, checked server-side (not just hidden in the UI).
- `src/types.ts` must stay in sync with `content/portfolio.json`'s actual shape at all times (existing repo rule).
- Package versions below are floors (`^` ranges) — `npm install` will resolve current compatible versions; where an external API's exact current shape matters (Puck, Auth.js v5), a verification step precedes the code that depends on it.

---

## Phase 1: Astro → Next.js migration (static, block content model)

### Task 1: Scaffold Next.js, remove Astro

**Files:**
- Modify: `package.json`
- Delete: `astro.config.mjs`
- Create: `next.config.js`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run dev` (Next dev server), `npm run build` (Next static export to `out/`), `npm run test` (Vitest), `npm run check` (tsc), `npm run lint`/`lint:fix` (Biome) — later tasks depend on these script names existing.

- [ ] **Step 1: Remove Astro, add Next.js/React deps**

```bash
npm uninstall astro @astrojs/check
npm install next@^15 react@^18 react-dom@^18
npm install -D @types/react@^18 @types/react-dom@^18
```

- [ ] **Step 2: Replace `package.json` scripts and metadata**

```json
{
  "name": "truong-nam-portfolio",
  "private": true,
  "version": "1.0.0",
  "description": "Truong Nam Nguyen portfolio — Next.js site generated from content/portfolio.json",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "check": "tsc --noEmit",
    "test": "vitest run",
    "lint": "biome check .",
    "lint:fix": "biome check --write ."
  }
}
```

(Keep the `dependencies`/`devDependencies` blocks `npm install` just wrote — only replace `name`/`description`/`scripts` above.)

- [ ] **Step 3: Delete `astro.config.mjs`, add `next.config.js`**

```bash
rm astro.config.mjs
```

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
};

module.exports = nextConfig;
```

`output: 'export'` keeps this phase fully static (no server, no adapter) — Phase 2 removes this once auth/API routes need a server runtime.

- [ ] **Step 4: Replace `tsconfig.json` for Next.js**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

- [ ] **Step 5: Update `.gitignore`**

Replace the `dist/` and `.astro/` lines with:

```
# Next.js build output and cache
.next/
out/
```

- [ ] **Step 6: Verify it builds**

Run: `npm run build`
Expected: Next.js reports a config/routing error (no `app/` directory exists yet) — this confirms Astro is fully gone and Next.js is wired up. This is expected to fail until Task 8 adds `app/page.tsx`; do not treat this as a blocker for this task.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json next.config.js tsconfig.json .gitignore
git rm astro.config.mjs
git commit -m "Replace Astro with Next.js scaffolding"
```

---

### Task 2: Block-based content model, migration script, test harness

**Files:**
- Modify: `src/types.ts`
- Create: `scripts/migrate-portfolio-content.mjs` (deleted at end of this task)
- Create: `scripts/verify-content-fidelity.mjs` (deleted at end of this task)
- Modify: `content/portfolio.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Install: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`

**Interfaces:**
- Produces: `Block` discriminated union and `Tab { label: string; blocks: Block[] }` in `src/types.ts` — every later component/task imports these exact type names. `PortfolioData.tabs` keys unchanged: `teaching`, `internationalEducation`, `testing`, `academicBackground`, `publications`, `talks`, `media`.

- [ ] **Step 1: Install the test harness**

```bash
npm install -D vitest@^2 @vitejs/plugin-react@^4 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Write the failing content-fidelity test**

```js
// scripts/verify-content-fidelity.test.mjs (temporary — deleted in Step 6)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function leafStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) leafStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) leafStrings(v, out);
  }
  return out;
}

describe('portfolio.json migration', () => {
  it('preserves every content string exactly after restructuring into blocks', () => {
    const before = execSync('git show HEAD:content/portfolio.json').toString();
    writeFileSync('/tmp/portfolio-before.json', before);
    execSync('node scripts/migrate-portfolio-content.mjs');

    const oldData = JSON.parse(readFileSync('/tmp/portfolio-before.json', 'utf8'));
    const newData = JSON.parse(readFileSync('content/portfolio.json', 'utf8'));

    expect(leafStrings(newData).sort()).toEqual(leafStrings(oldData).sort());
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run scripts/verify-content-fidelity.test.mjs`
Expected: FAIL — `scripts/migrate-portfolio-content.mjs` does not exist yet.

- [ ] **Step 4: Write `src/types.ts`**

```ts
// Shape of content/portfolio.json. Keep in sync with that file — see CLAUDE.md.

export interface Job {
  type: 'job';
  company: string;
  dates: string;
  role?: string;
  bullets?: string[];
}

export interface PlaceholderEntry {
  type: 'placeholder';
  company: string;
  note: string;
}

export interface Education {
  type: 'education';
  school: string;
  dates: string;
  degree: string;
  bullets?: string[];
  dissertation?: string;
}

export interface Certificate {
  text: string;
  accent?: boolean;
}

export interface CertificateGroupBlock {
  type: 'certificate-group';
  heading: string;
  certificates: Certificate[];
}

export type GalleryItemType = 'photo' | 'video';

export interface GalleryItemBlock {
  type: 'gallery-item';
  itemType: GalleryItemType;
  image?: string;
  videoUrl?: string;
}

export interface NoteBlock {
  type: 'note';
  text: string;
}

export type Block =
  | Job
  | PlaceholderEntry
  | Education
  | CertificateGroupBlock
  | GalleryItemBlock
  | NoteBlock;

export interface Hero {
  name: string;
  initials: string;
  role: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  profile: string;
}

export interface Tab {
  label: string;
  blocks: Block[];
}

export interface PortfolioData {
  hero: Hero;
  tabs: {
    teaching: Tab;
    internationalEducation: Tab;
    testing: Tab;
    academicBackground: Tab;
    publications: Tab;
    talks: Tab;
    media: Tab;
  };
  footer: string;
}
```

Note the deliberate rename of `GalleryItem`'s `type` field (`'photo' | 'video'`) to `itemType`, since `type` is now reserved for the block-discriminant (`'gallery-item'`).

- [ ] **Step 5: Write and run the migration script**

```js
// scripts/migrate-portfolio-content.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const oldData = JSON.parse(readFileSync('content/portfolio.json', 'utf8'));

// Refuse to run against already-migrated content: re-running this against the
// new block shape would read `oldData.tabs.teaching.jobs` as undefined and
// silently overwrite content/portfolio.json with emptied-out blocks.
if (oldData.tabs?.teaching?.blocks) {
  console.error('content/portfolio.json already looks migrated (teaching.blocks exists) — aborting.');
  process.exit(1);
}

const jobsToBlocks = (jobs = []) => jobs.map((j) => ({ type: 'job', ...j }));
const placeholdersToBlocks = (items = []) => items.map((p) => ({ type: 'placeholder', ...p }));
const educationToBlocks = (education = []) => education.map((e) => ({ type: 'education', ...e }));
const galleryItemsToBlocks = (items = []) =>
  items.map(({ type, ...rest }) => ({ type: 'gallery-item', itemType: type, ...rest }));

const newData = {
  hero: oldData.hero,
  tabs: {
    teaching: {
      label: oldData.tabs.teaching.label,
      blocks: [
        ...jobsToBlocks(oldData.tabs.teaching.jobs),
        ...placeholdersToBlocks(oldData.tabs.teaching.placeholders),
      ],
    },
    internationalEducation: {
      label: oldData.tabs.internationalEducation.label,
      blocks: jobsToBlocks(oldData.tabs.internationalEducation.jobs),
    },
    testing: {
      label: oldData.tabs.testing.label,
      blocks: [
        {
          type: 'certificate-group',
          heading: 'Certificates',
          certificates: oldData.tabs.testing.certificates,
        },
        ...jobsToBlocks(oldData.tabs.testing.jobs),
        { type: 'note', text: oldData.tabs.testing.emptyNote },
      ],
    },
    academicBackground: {
      label: oldData.tabs.academicBackground.label,
      blocks: educationToBlocks(oldData.tabs.academicBackground.education),
    },
    publications: {
      label: oldData.tabs.publications.label,
      blocks: [{ type: 'note', text: oldData.tabs.publications.emptyNote }],
    },
    talks: {
      label: oldData.tabs.talks.label,
      blocks: [{ type: 'note', text: oldData.tabs.talks.emptyNote }],
    },
    media: {
      label: oldData.tabs.media.label,
      blocks: galleryItemsToBlocks(oldData.tabs.media.items),
    },
  },
  footer: oldData.footer,
};

writeFileSync('content/portfolio.json', `${JSON.stringify(newData, null, 2)}\n`);
console.log('Migrated content/portfolio.json to block model.');
```

- [ ] **Step 6: Run the test to confirm it passes, then delete both scripts**

Run: `npx vitest run scripts/verify-content-fidelity.test.mjs`
Expected: PASS — all content strings preserved exactly.

```bash
rm scripts/verify-content-fidelity.test.mjs
rmdir scripts 2>/dev/null || true
```

(`migrate-portfolio-content.mjs` already did its one job — `content/portfolio.json` is now migrated in the working tree. Remove the script itself since it's a one-off, not a tool to keep.)

```bash
rm scripts/migrate-portfolio-content.mjs
```

- [ ] **Step 7: Commit**

```bash
git add src/types.ts content/portfolio.json vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "Rewrite content model to typed blocks, migrate portfolio.json"
```

---

### Task 3: BlockRenderer + new block components (CertificateGroup, Note)

**Files:**
- Create: `src/components/BlockRenderer.tsx`
- Create: `src/components/CertificateGroup.tsx`
- Create: `src/components/Note.tsx`
- Test: `src/components/BlockRenderer.test.tsx`
- Test: `src/components/CertificateGroup.test.tsx`

**Interfaces:**
- Consumes: `Block`, `CertificateGroupBlock`, `NoteBlock` from `src/types.ts` (Task 2).
- Produces: `BlockRenderer({ block: Block })` — every tab-rendering task (Task 7, Task 8) renders lists via `<BlockRenderer block={block} />`. `CertificateGroup({ group: CertificateGroupBlock })`, `Note({ text: string })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/CertificateGroup.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CertificateGroup } from './CertificateGroup';

describe('CertificateGroup', () => {
  it('renders the heading and each certificate, marking accented ones', () => {
    render(
      <CertificateGroup
        group={{
          type: 'certificate-group',
          heading: 'Certificates',
          certificates: [
            { text: 'IELTS Academic — 8.0', accent: true },
            { text: 'HSK Level 3', accent: false },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument();
    expect(screen.getByText('IELTS Academic — 8.0')).toHaveClass('tag', 'accent');
    expect(screen.getByText('HSK Level 3')).toHaveClass('tag');
    expect(screen.getByText('HSK Level 3')).not.toHaveClass('accent');
  });
});
```

```tsx
// src/components/BlockRenderer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BlockRenderer } from './BlockRenderer';
import type { Block } from '../types';

describe('BlockRenderer', () => {
  it('dispatches a note block to a rendered <div class="placeholder">', () => {
    const block: Block = { type: 'note', text: 'Nothing here yet.' };
    render(<BlockRenderer block={block} />);
    expect(screen.getByText('Nothing here yet.')).toHaveClass('placeholder');
  });
});
```

- [ ] **Step 2: Run to confirm both fail**

Run: `npx vitest run src/components/CertificateGroup.test.tsx src/components/BlockRenderer.test.tsx`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement `Note.tsx`**

```tsx
// src/components/Note.tsx
interface Props {
  text: string;
}

export function Note({ text }: Props) {
  return <div className="placeholder">{text}</div>;
}
```

- [ ] **Step 4: Implement `CertificateGroup.tsx`**

```tsx
// src/components/CertificateGroup.tsx
import type { CertificateGroupBlock } from '../types';

interface Props {
  group: CertificateGroupBlock;
}

export function CertificateGroup({ group }: Props) {
  return (
    <div className="block-card">
      <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>{group.heading}</h3>
      <div className="tag-row">
        {group.certificates.map((cert, i) => (
          <span key={i} className={`tag${cert.accent ? ' accent' : ''}`}>
            {cert.text}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement `BlockRenderer.tsx`**

Other block components (`JobCard`, `PlaceholderCard`, `EducationCard`, `GalleryTile`) don't exist yet (Tasks 4–6) — this step forward-declares them; the build won't type-check green until those tasks land, which is expected within this phase.

```tsx
// src/components/BlockRenderer.tsx
import type { Block } from '../types';
import { JobCard } from './JobCard';
import { PlaceholderCard } from './PlaceholderCard';
import { EducationCard } from './EducationCard';
import { CertificateGroup } from './CertificateGroup';
import { GalleryTile } from './GalleryTile';
import { Note } from './Note';

interface Props {
  block: Block;
}

export function BlockRenderer({ block }: Props) {
  switch (block.type) {
    case 'job':
      return <JobCard job={block} />;
    case 'placeholder':
      return <PlaceholderCard item={block} />;
    case 'education':
      return <EducationCard ed={block} />;
    case 'certificate-group':
      return <CertificateGroup group={block} />;
    case 'gallery-item':
      return <GalleryTile item={block} />;
    case 'note':
      return <Note text={block.text} />;
    default: {
      // Exhaustiveness check: a new Block variant with no case here is a compile error.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 6: Run tests, confirm pass (Tasks 4–6 still owe the other components)**

Run: `npx vitest run src/components/CertificateGroup.test.tsx`
Expected: PASS.
(`BlockRenderer.test.tsx` will only pass once `JobCard`, `PlaceholderCard`, `EducationCard`, `GalleryTile` exist — re-run it at the end of Task 6.)

- [ ] **Step 7: Commit**

```bash
git add src/components/BlockRenderer.tsx src/components/CertificateGroup.tsx src/components/Note.tsx src/components/CertificateGroup.test.tsx src/components/BlockRenderer.test.tsx
git commit -m "Add BlockRenderer, CertificateGroup, and Note components"
```

---

### Task 4: Convert Hero + MetaItem to React

**Files:**
- Create: `src/components/Hero.tsx`
- Create: `src/components/MetaItem.tsx`
- Test: `src/components/Hero.test.tsx`
- Delete: `src/components/Hero.astro`, `src/components/MetaItem.astro`

**Interfaces:**
- Consumes: `Hero` type from `src/types.ts`.
- Produces: `Hero({ hero: HeroData })`, used by `app/page.tsx` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/Hero.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders contact links only for fields that are present', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          initials: 'TNN',
          role: 'Programme Coordinator',
          email: 'truongnam307@gmail.com',
          profile: 'Professional summary.',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Truong Nam Nguyen' })).toBeInTheDocument();
    const emailLink = screen.getByRole('link');
    expect(emailLink).toHaveAttribute('href', 'mailto:truongnam307@gmail.com');
    // No phone/linkedin/location were provided, so only one meta link renders.
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/Hero.test.tsx`
Expected: FAIL — `./Hero` doesn't exist.

- [ ] **Step 3: Implement `MetaItem.tsx`**

```tsx
// src/components/MetaItem.tsx
interface Props {
  icon: 'phone' | 'mail' | 'linkedin' | 'pin';
  text?: string;
  href?: string;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
const ICON_PATHS: Record<Props['icon'], string> = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  linkedin:
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};

export function MetaItem({ icon, text, href }: Props) {
  if (!text) return null;

  const isExternal = href ? /^https?:/.test(href) : false;
  // Cast is safe: href is only ever passed when Tag is 'a'.
  const Tag = (href ? 'a' : 'span') as React.ElementType;

  return (
    <Tag
      className="meta-item"
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener' : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: ICON_PATHS[icon] }}
      />
      {text}
    </Tag>
  );
}
```

- [ ] **Step 4: Implement `Hero.tsx`**

```tsx
// src/components/Hero.tsx
import type { Hero as HeroData } from '../types';
import { MetaItem } from './MetaItem';

interface Props {
  hero: HeroData;
}

export function Hero({ hero }: Props) {
  const phoneHref = hero.phone && `tel:${hero.phone.replace(/[^\d+]/g, '')}`;
  const emailHref = hero.email && `mailto:${hero.email}`;
  const linkedinHref =
    hero.linkedin && (/^https?:\/\//.test(hero.linkedin) ? hero.linkedin : `https://${hero.linkedin}`);
  const locationHref =
    hero.location &&
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hero.location)}`;

  return (
    <header className="hero">
      <div className="wrap">
        <div className="hero-top">
          <div className="hero-heading">
            <h1>{hero.name}</h1>
            <p className="role">{hero.role}</p>
          </div>
          <div className="avatar" aria-hidden="true">
            {hero.initials}
          </div>
        </div>
        <div className="meta-row">
          <MetaItem icon="phone" text={hero.phone} href={phoneHref} />
          <MetaItem icon="mail" text={hero.email} href={emailHref} />
          <MetaItem icon="linkedin" text={hero.linkedin} href={linkedinHref} />
          <MetaItem icon="pin" text={hero.location} href={locationHref} />
        </div>
        <p className="profile">{hero.profile}</p>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run test, confirm it passes**

Run: `npx vitest run src/components/Hero.test.tsx`
Expected: PASS.

- [ ] **Step 6: Delete the Astro originals, commit**

```bash
git rm src/components/Hero.astro src/components/MetaItem.astro
git add src/components/Hero.tsx src/components/MetaItem.tsx src/components/Hero.test.tsx
git commit -m "Convert Hero and MetaItem from Astro to React"
```

---

### Task 5: Convert JobCard + EducationCard + PlaceholderCard to React

**Files:**
- Create: `src/components/JobCard.tsx`, `src/components/EducationCard.tsx`, `src/components/PlaceholderCard.tsx`
- Test: `src/components/JobCard.test.tsx`
- Delete: the three corresponding `.astro` files

**Interfaces:**
- Consumes: `Job`, `Education`, `PlaceholderEntry` from `src/types.ts`.
- Produces: `JobCard({ job: Job })`, `EducationCard({ ed: Education })`, `PlaceholderCard({ item: PlaceholderEntry })` — used by `BlockRenderer` (Task 3).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/JobCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobCard } from './JobCard';

describe('JobCard', () => {
  it('omits the role paragraph and bullet list when absent', () => {
    render(<JobCard job={{ type: 'job', company: 'Acme', dates: '2020' }} />);
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders bullets when present', () => {
    render(
      <JobCard
        job={{ type: 'job', company: 'Acme', dates: '2020', role: 'Engineer', bullets: ['Did a thing.'] }}
      />,
    );
    expect(screen.getByText('Did a thing.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/JobCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement all three components**

```tsx
// src/components/JobCard.tsx
import type { Job } from '../types';

interface Props {
  job: Job;
}

export function JobCard({ job }: Props) {
  return (
    <div className="block-card">
      <div className="block-title-row">
        <h3>{job.company}</h3>
        <span className="dates">{job.dates}</span>
      </div>
      {job.role && <p className="role">{job.role}</p>}
      {job.bullets && job.bullets.length > 0 && (
        <ul>
          {job.bullets.map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

```tsx
// src/components/EducationCard.tsx
import type { Education } from '../types';

interface Props {
  ed: Education;
}

export function EducationCard({ ed }: Props) {
  return (
    <div className="block-card">
      <div className="block-title-row">
        <h3>{ed.school}</h3>
        <span className="dates">{ed.dates}</span>
      </div>
      <p className="role">{ed.degree}</p>
      <ul>
        {(ed.bullets || []).map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
        {ed.dissertation && (
          <li>
            Dissertation: <i>{ed.dissertation}</i>.
          </li>
        )}
      </ul>
    </div>
  );
}
```

```tsx
// src/components/PlaceholderCard.tsx
import type { PlaceholderEntry } from '../types';

interface Props {
  item: PlaceholderEntry;
}

export function PlaceholderCard({ item }: Props) {
  return (
    <div className="placeholder card">
      <h3>{item.company}</h3>
      <p>{item.note}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/components/JobCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Delete the Astro originals, commit**

```bash
git rm src/components/JobCard.astro src/components/EducationCard.astro src/components/PlaceholderCard.astro
git add src/components/JobCard.tsx src/components/EducationCard.tsx src/components/PlaceholderCard.tsx src/components/JobCard.test.tsx
git commit -m "Convert JobCard, EducationCard, PlaceholderCard from Astro to React"
```

---

### Task 6: Convert GalleryTile to React

**Files:**
- Create: `src/components/GalleryTile.tsx`
- Test: `src/components/GalleryTile.test.tsx`
- Delete: `src/components/GalleryTile.astro`

**Interfaces:**
- Consumes: `GalleryItemBlock` from `src/types.ts`.
- Produces: `GalleryTile({ item: GalleryItemBlock })` — used by `BlockRenderer` (Task 3).

- [ ] **Step 1: Write the failing tests (all four branches)**

```tsx
// src/components/GalleryTile.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryTile } from './GalleryTile';

describe('GalleryTile', () => {
  it('renders a playable link when a video has a URL', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video', videoUrl: 'https://example.com/v' }} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/v');
    expect(screen.getByText('Watch video')).toBeInTheDocument();
  });

  it('renders an add-video prompt when a video has no URL', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video' }} />);
    expect(screen.getByText('+ Add video')).toBeInTheDocument();
  });

  it('renders an image when a photo has one', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo', image: 'https://example.com/p.jpg' }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/p.jpg');
  });

  it('renders an add-photo prompt when a photo has no image', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo' }} />);
    expect(screen.getByText('+ Add photo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/GalleryTile.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `GalleryTile.tsx`**

```tsx
// src/components/GalleryTile.tsx
import type { GalleryItemBlock } from '../types';

interface Props {
  item: GalleryItemBlock;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
const PHOTO_ICON_PATHS =
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
const VIDEO_ICON_PATHS =
  '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

export function GalleryTile({ item }: Props) {
  if (item.itemType === 'video') {
    if (item.videoUrl) {
      return (
        <a
          className="gallery-tile"
          href={item.videoUrl}
          target="_blank"
          rel="noopener"
          style={{ textDecoration: 'none' }}
        >
          {item.image ? (
            <img
              src={item.image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
            />
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
              />
              <span>Watch video</span>
            </>
          )}
        </a>
      );
    }
    return (
      <div className="gallery-tile">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
        />
        + Add video
      </div>
    );
  }

  if (item.image) {
    return (
      <div className="gallery-tile" style={{ padding: 0, overflow: 'hidden' }}>
        <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div className="gallery-tile">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: PHOTO_ICON_PATHS }}
      />
      + Add photo
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm they pass — including the earlier `BlockRenderer.test.tsx`**

Run: `npx vitest run`
Expected: PASS — every test file written so far (Tasks 2–6) is now green, since all `BlockRenderer` dependencies exist.

- [ ] **Step 5: Delete the Astro original, commit**

```bash
git rm src/components/GalleryTile.astro
git add src/components/GalleryTile.tsx src/components/GalleryTile.test.tsx
git commit -m "Convert GalleryTile from Astro to React"
```

---

### Task 7: TabbedContent client component (replaces TabNav + inline script)

**Files:**
- Create: `src/components/TabbedContent.tsx`
- Test: `src/components/TabbedContent.test.tsx`
- Delete: `src/components/TabNav.astro`

**Interfaces:**
- Consumes: `Block` from `src/types.ts`, `BlockRenderer` (Task 3).
- Produces: `TabbedContent({ tabs: { slug: string; label: string; blocks: Block[]; wrapperClassName?: string }[] })` — used by `app/page.tsx` (Task 8).

- [ ] **Step 1: Write the failing interaction test**

```tsx
// src/components/TabbedContent.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TabbedContent } from './TabbedContent';

describe('TabbedContent', () => {
  it('shows only the first tab active on load, and switches on click', async () => {
    const user = userEvent.setup();
    render(
      <TabbedContent
        tabs={[
          { slug: 'a', label: 'A', blocks: [{ type: 'note', text: 'Panel A' }] },
          { slug: 'b', label: 'B', blocks: [{ type: 'note', text: 'Panel B' }] },
        ]}
      />,
    );

    expect(document.getElementById('tab-a')).toHaveClass('active');
    expect(document.getElementById('tab-b')).not.toHaveClass('active');

    await user.click(screen.getByRole('button', { name: 'B' }));

    expect(document.getElementById('tab-a')).not.toHaveClass('active');
    expect(document.getElementById('tab-b')).toHaveClass('active');
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/components/TabbedContent.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `TabbedContent.tsx`**

```tsx
// src/components/TabbedContent.tsx
'use client';

import { useState } from 'react';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';

interface Tab {
  slug: string;
  label: string;
  blocks: Block[];
  wrapperClassName?: string;
}

interface Props {
  tabs: Tab[];
}

export function TabbedContent({ tabs }: Props) {
  const [activeSlug, setActiveSlug] = useState(tabs[0]?.slug ?? '');

  return (
    <>
      <nav className="tabs">
        <div className="wrap">
          {tabs.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              className={`tab-btn${tab.slug === activeSlug ? ' active' : ''}`}
              onClick={() => setActiveSlug(tab.slug)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        <div className="wrap">
          {tabs.map((tab) => (
            <section
              key={tab.slug}
              id={`tab-${tab.slug}`}
              className={`tab-panel${tab.slug === activeSlug ? ' active' : ''}`}
            >
              {tab.wrapperClassName ? (
                <div className={tab.wrapperClassName}>
                  {/* Blocks don't reorder client-side outside the admin panel, so index keys are safe here. */}
                  {tab.blocks.map((block, i) => (
                    <BlockRenderer key={i} block={block} />
                  ))}
                </div>
              ) : (
                tab.blocks.map((block, i) => <BlockRenderer key={i} block={block} />)
              )}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/components/TabbedContent.test.tsx`
Expected: PASS.

- [ ] **Step 5: Delete the Astro original, commit**

```bash
git rm src/components/TabNav.astro
git add src/components/TabbedContent.tsx src/components/TabbedContent.test.tsx
git commit -m "Add TabbedContent client component, replacing TabNav and the inline tab script"
```

---

### Task 8: `app/layout.tsx` + `app/page.tsx` + `portfolioContent.ts` (v1), remove old Astro page

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `src/lib/portfolioContent.ts`
- Delete: `src/pages/index.astro`, `.astro/` directory (build cache — delete manually if present)

**Interfaces:**
- Produces: `getPortfolioContent(): Promise<PortfolioData>` — Task 11 (Phase 2) replaces this implementation with a Blobs-backed version, keeping this exact function name/signature so `app/page.tsx` doesn't change.

- [ ] **Step 1: Implement `src/lib/portfolioContent.ts` (v1: static import)**

```ts
// src/lib/portfolioContent.ts
import rawData from '../../content/portfolio.json';
import type { PortfolioData } from '../types';

export async function getPortfolioContent(): Promise<PortfolioData> {
  return rawData as PortfolioData;
}
```

- [ ] **Step 2: Implement `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import '../src/styles/global.css';

export const metadata: Metadata = {
  title: 'Truong Nam Nguyen — Portfolio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Implement `app/page.tsx`**

```tsx
// app/page.tsx
import type { PortfolioData } from '../src/types';
import { Hero } from '../src/components/Hero';
import { TabbedContent } from '../src/components/TabbedContent';
import { getPortfolioContent } from '../src/lib/portfolioContent';

const TAB_ORDER: { key: keyof PortfolioData['tabs']; slug: string }[] = [
  { key: 'teaching', slug: 'teaching' },
  { key: 'internationalEducation', slug: 'intl-education' },
  { key: 'testing', slug: 'testing' },
  { key: 'academicBackground', slug: 'academic-background' },
  { key: 'publications', slug: 'publications' },
  { key: 'talks', slug: 'talks' },
  { key: 'media', slug: 'media' },
];

export default async function HomePage() {
  const data = await getPortfolioContent();

  const tabs = TAB_ORDER.map((t) => ({
    slug: t.slug,
    label: data.tabs[t.key].label,
    blocks: data.tabs[t.key].blocks,
    wrapperClassName: t.key === 'media' ? 'gallery-grid' : undefined,
  }));

  return (
    <>
      <Hero hero={data.hero} />
      <TabbedContent tabs={tabs} />
      <footer>
        <div className="wrap">{data.footer}</div>
      </footer>
    </>
  );
}
```

- [ ] **Step 4: Remove the old Astro page and build cache**

```bash
git rm src/pages/index.astro
rmdir src/pages 2>/dev/null || true
rm -rf .astro
```

- [ ] **Step 5: Build and manually verify**

Run: `npm run build && npx serve out`
Expected: build succeeds; visiting the served site shows the Hero, all seven tabs, tab-switching works, and every block type (job, placeholder, education, certificate group, gallery item, note) renders — compare visually against the previous Astro `dist/` output (or the currently-deployed site) tab by tab.

- [ ] **Step 6: Commit**

```bash
git add app/ src/lib/portfolioContent.ts
git commit -m "Add Next.js app shell reading portfolio content, remove Astro page"
```

---

### Task 9: Update tooling/docs for the static Next.js build, final Phase 1 verification

**Files:**
- Modify: `netlify.toml`
- Modify: `biome.json`
- Modify: `README.md`

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Update `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "out"
```

- [ ] **Step 2: Update `biome.json`** — drop the now-irrelevant `.astro` exclusion

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.9/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["**", "!!**/out", "!!**/.next", "!!package-lock.json"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended"
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single"
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

- [ ] **Step 3: Run Biome and fix anything it flags**

Run: `npm run lint`
Expected: no errors (or only trivial formatting fixes — apply with `npm run lint:fix` and re-run `npm run lint` to confirm clean).

- [ ] **Step 4: Update `README.md`**

Replace the Astro-specific sections (`## How it works`, `## Editing content`, `## Deploying`, `## TypeScript & Biome`, `## Project structure`) with the Next.js equivalents — same structure/headings, updated content:

```markdown
# Portfolio Site

A single-page CV/portfolio site, built with [Next.js](https://nextjs.org)
(App Router), driven by one JSON content file — with a live admin panel
(Puck) landing in a later phase of this repo's migration.

## How it works

\`\`\`
content/portfolio.json      ← all editable text (source of truth for now)
        │
        │  npm run build  (next build)
        ▼
app/page.tsx                 ← loads content via src/lib/portfolioContent.ts
src/components/*.tsx          ← Hero, TabbedContent, BlockRenderer, JobCard, ...
        │
        ▼
    out/index.html            ← generated static page — do not hand-edit, do not commit
\`\`\`

- `content/portfolio.json` holds every piece of text on the page, restructured
  into per-tab arrays of typed blocks (`job`, `placeholder`, `education`,
  `certificate-group`, `gallery-item`, `note`) — see `src/types.ts`.
- `app/page.tsx` loads that data via `getPortfolioContent()` and renders it by
  composing `src/components/*.tsx`, dispatching each block through
  `BlockRenderer`.
- `src/styles/global.css` is still the site's one stylesheet — imported once by
  `app/layout.tsx`, not scoped per component.
- `out/` is Next.js's static export output (gitignored). Don't hand-edit
  anything in it.

## Editing content

Edit `content/portfolio.json`, then run:

\`\`\`sh
npm run build          # writes out/index.html
npx serve out           # serve out/ locally to check it
\`\`\`

or `npm run dev` for a live-reloading dev server while iterating on components.

## Deploying

Push to GitHub, then connect the repo to [Netlify](https://netlify.com).
`netlify.toml` sets:

\`\`\`toml
[build]
  command = "npm run build"
  publish = "out"
\`\`\`

This is currently a plain static export — no adapter, no server rendering.
(A later phase of this migration adds a live admin panel, which will require
switching this to server rendering via `@netlify/plugin-nextjs` — see
`docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md`.)

## TypeScript, testing, and Biome

\`\`\`sh
npm run check   # tsc --noEmit
npm run test    # vitest run
\`\`\`

`src/types.ts` defines `PortfolioData`/`Block`, matching `content/portfolio.json`'s
shape — keep it in sync when the schema changes.

\`\`\`sh
npm run lint        # report issues, no changes
npm run lint:fix     # apply safe fixes + formatting
\`\`\`

## Project structure

\`\`\`
.
├── content/
│   └── portfolio.json     Editable content — the source of truth (for now)
├── app/
│   ├── layout.tsx           Root layout — imports global.css, fonts
│   └── page.tsx              Loads portfolio content, composes the page
├── src/
│   ├── components/           Hero, TabbedContent, BlockRenderer, JobCard, ...
│   ├── lib/
│   │   └── portfolioContent.ts   getPortfolioContent()
│   ├── styles/
│   │   └── global.css         The site's one stylesheet
│   └── types.ts                PortfolioData/Block — matches content/portfolio.json
├── next.config.js         output: 'export' (static, for now)
├── tsconfig.json
├── biome.json
├── netlify.toml            Build command (npm run build) + publish dir (out)
└── package.json
\`\`\`
\`\`\`
```

- [ ] **Step 5: Commit**

```bash
git add netlify.toml biome.json README.md
git commit -m "Update netlify.toml, biome.json, and README for the Next.js static build"
```

Phase 1 is now complete and independently shippable: the site is a Next.js static export with identical behavior/visuals to the Astro version, on the block content model Puck will need.

---

## Phase 2: Auth + Netlify Blobs persistence + bare admin route

### Task 10: Add auth/Blobs deps, switch off static export

**Files:**
- Modify: `package.json`
- Modify: `next.config.js`
- Modify: `netlify.toml`

**Interfaces:** none new yet — this task only changes the runtime mode later tasks depend on.

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@beta @netlify/blobs@^8
npm install -D @netlify/plugin-nextjs@^5
```

(`next-auth@beta` is Auth.js v5, which is what the App Router `auth.ts`/`handlers` pattern in Task 13 requires — v4's default-export-in-route-file pattern will not match that code. Confirm this is still the current beta/stable tag when running the install; adjust the version tag if npm reports a different current release line.)

- [ ] **Step 2: Remove static export from `next.config.js`**

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
```

(No `output: 'export'` — Netlify's Next.js plugin now handles server rendering, API routes, and middleware.)

- [ ] **Step 3: Point `netlify.toml` at the Next.js plugin**

```toml
[build]
  command = "npm run build"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

(No `publish` directory — the plugin manages Next.js's build output itself.)

- [ ] **Step 4: Verify the build still works in server mode**

Run: `npm run build`
Expected: succeeds (no `output: 'export'`-specific errors); `npm run dev` still serves the same page as before.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.js netlify.toml
git commit -m "Switch to Next.js server rendering via @netlify/plugin-nextjs"
```

---

### Task 11: `portfolioContent.ts` v2 — Netlify Blobs (with a local-dev fallback) + history snapshots

**Local-dev problem this task solves:** `@netlify/blobs` needs Netlify's runtime context (site/deploy identity), which only exists on an actual Netlify deploy or under `netlify dev` with a linked site. Plain `npm run dev` (`next dev`) has neither, so calling it directly would make every read/write throw locally — meaning Tasks 14, 17, and 18's "edit → save → confirm the public page updates" verification steps would be un-runnable as written. This task adds a small store abstraction so local dev exercises the exact same read/write/history-snapshot logic against a gitignored local JSON file instead, with zero difference in the public API the rest of the plan depends on.

**Files:**
- Create: `src/lib/blobStore.ts`
- Test: `src/lib/blobStore.test.ts`
- Modify: `src/lib/portfolioContent.ts`
- Test: `src/lib/portfolioContent.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `getContentStore(storeName: string): ContentStore` where `ContentStore = { get(key: string): Promise<unknown | null>; setJSON(key: string, value: unknown): Promise<void> }` — `portfolioContent.ts` (this task) is its only consumer. `getPortfolioContent(): Promise<PortfolioData>` (same signature as v1 — `app/page.tsx` needs no changes), `savePortfolioContent(data: PortfolioData): Promise<void>` — Task 14's save action and Task 17's Puck save action both call this.

- [ ] **Step 1: Write the failing test for the local file store**

```ts
// src/lib/blobStore.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'blobstore-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  vi.resetModules();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('getContentStore (local file fallback)', () => {
  it('returns null for a key that has never been written', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    expect(await store.get('current.json')).toBeNull();
  });

  it('round-trips a value written with setJSON, including nested keys', async () => {
    const { getContentStore } = await import('./blobStore');
    const store = getContentStore('portfolio');
    await store.setJSON('history/2026-01-01.json', { hero: { name: 'Test' } });
    expect(await store.get('history/2026-01-01.json')).toEqual({ hero: { name: 'Test' } });
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/blobStore.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `blobStore.ts`**

> **Note (added after Phase 2's final review):** the code block below has the
> bug the review caught — `getStore(storeName)` in the real-Blobs branch must
> read with `.get(key, { type: 'json' })`, not a bare `.get(key)`, or callers
> get a raw JSON string instead of a parsed object. See the fixed version in
> `src/lib/blobStore.ts` if Phase 3 references this section.

```ts
// src/lib/blobStore.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStore } from '@netlify/blobs';

export interface ContentStore {
  get(key: string): Promise<unknown | null>;
  setJSON(key: string, value: unknown): Promise<void>;
}

function localFileStore(storeName: string): ContentStore {
  const baseDir = path.join(process.cwd(), '.local-blobs', storeName);
  return {
    async get(key) {
      const filePath = path.join(baseDir, key);
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf8'));
    },
    async setJSON(key, value) {
      const filePath = path.join(baseDir, key);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, JSON.stringify(value, null, 2));
    },
  };
}

export function getContentStore(storeName: string): ContentStore {
  // Netlify's build/runtime and `netlify dev` both set NETLIFY=true; plain
  // `next dev`/`next start` don't, and have no Blobs context to read from —
  // fall back to a local gitignored JSON store so local dev and manual
  // verification work without requiring the Netlify CLI or a linked site.
  return process.env.NETLIFY ? getStore(storeName) : localFileStore(storeName);
}
```

- [ ] **Step 4: Run test, confirm it passes; update `.gitignore`**

Run: `npx vitest run src/lib/blobStore.test.ts`
Expected: PASS.

Add to `.gitignore`:

```
# Local stand-in for Netlify Blobs, used when NETLIFY is unset (plain `next dev`)
.local-blobs/
```

- [ ] **Step 5: Write the failing tests for `portfolioContent.ts` against a mocked store**

```ts
// src/lib/portfolioContent.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStore = new Map<string, unknown>();

vi.mock('./blobStore', () => ({
  getContentStore: () => ({
    get: async (key: string) => memoryStore.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => {
      memoryStore.set(key, value);
    },
  }),
}));

import { getPortfolioContent, savePortfolioContent } from './portfolioContent';

describe('portfolioContent', () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it('falls back to the seed file when nothing has been saved yet', async () => {
    const data = await getPortfolioContent();
    expect(data.hero.name).toBe('Truong Nam Nguyen');
  });

  it('returns the saved value once one exists, and writes a history snapshot', async () => {
    const seeded = await getPortfolioContent();
    const updated = { ...seeded, footer: 'Updated footer' };

    await savePortfolioContent(updated);

    const current = await getPortfolioContent();
    expect(current.footer).toBe('Updated footer');

    const historyKeys = [...memoryStore.keys()].filter((k) => k.startsWith('history/'));
    expect(historyKeys).toHaveLength(1);
    expect(memoryStore.get(historyKeys[0])).toEqual(updated);
  });

  it('falls back to the seed file if the store read throws, rather than crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalGet = memoryStore.get.bind(memoryStore);
    memoryStore.get = () => {
      throw new Error('simulated store outage');
    };

    const data = await getPortfolioContent();
    expect(data.hero.name).toBe('Truong Nam Nguyen');

    memoryStore.get = originalGet;
  });
});
```

- [ ] **Step 6: Run to confirm it fails**

Run: `npx vitest run src/lib/portfolioContent.test.ts`
Expected: FAIL — `savePortfolioContent` doesn't exist yet, and `getPortfolioContent` doesn't read from a store or handle a throw.

- [ ] **Step 7: Implement `portfolioContent.ts` v2**

```ts
// src/lib/portfolioContent.ts
import { getContentStore } from './blobStore';
import seedData from '../../content/portfolio.json';
import type { PortfolioData } from '../types';

const STORE_NAME = 'portfolio';
const CURRENT_KEY = 'current.json';

function historyKey(): string {
  return `history/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function getPortfolioContent(): Promise<PortfolioData> {
  const store = getContentStore(STORE_NAME);
  try {
    const current = (await store.get(CURRENT_KEY)) as PortfolioData | null;
    return current ?? (seedData as PortfolioData);
  } catch (error) {
    // A store read failure (not just "nothing saved yet") should degrade to the
    // seed content rather than break the public page — see spec's Error handling section.
    console.error('Failed to read portfolio content from the content store, falling back to seed data:', error);
    return seedData as PortfolioData;
  }
}

export async function savePortfolioContent(data: PortfolioData): Promise<void> {
  const store = getContentStore(STORE_NAME);
  await store.setJSON(CURRENT_KEY, data);
  // Timestamped snapshot on every save — this is the "git diff before commit"
  // safety net a git-tracked file gave for free, now that content lives in a
  // Blob/local store instead of a git-tracked file.
  await store.setJSON(historyKey(), data);
}
```

- [ ] **Step 8: Run tests, confirm they pass**

Run: `npx vitest run src/lib/portfolioContent.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/blobStore.ts src/lib/blobStore.test.ts src/lib/portfolioContent.ts src/lib/portfolioContent.test.ts .gitignore
git commit -m "Back portfolioContent with Netlify Blobs, a local-dev file fallback, and history snapshots"
```

---

### Task 12: Confirm `app/page.tsx` still works against the new loader

**Files:**
- No source changes expected — `app/page.tsx` already calls `getPortfolioContent()` by name (Task 8), so Task 11's swap is transparent.

**Interfaces:** none new.

- [ ] **Step 1: Run the full test suite and a manual check**

Run: `npm run test && npm run build && npm run dev`
Expected: all tests pass; visiting the dev server shows the same page as before. Locally (no `NETLIFY` env var set) this now reads through `getContentStore`'s local-file fallback from Task 11 — an empty `.local-blobs/` means `getPortfolioContent()` falls back to the seed `content/portfolio.json`, which is the correct behavior to confirm here (production will start from exactly this state on first deploy too, reading real Blobs instead of the local file).

Then confirm the *write* path also works locally, since Task 14 depends on it: in a Node REPL or a throwaway script, `await import('./src/lib/portfolioContent.js').then(m => m.savePortfolioContent({...seed data, footer: 'test'}))` (adjust the import to however the project resolves TS at runtime, e.g. via `tsx`) and confirm a `.local-blobs/portfolio/current.json` file appears with the change, and a `.local-blobs/portfolio/history/*.json` snapshot alongside it. Delete `.local-blobs/` afterward so it doesn't linger as stale local state (it's gitignored, so this is just tidiness, not a git operation).

- [ ] **Step 2: If everything matches, there is nothing to commit for this task**

This task is a checkpoint, not a code change — if the manual check surfaces a mismatch, fix it as part of Task 11 instead of here (that's where the responsible code lives) and re-run this check.

---

### Task 13: Allow-list check, NextAuth config, route handler

**Files:**
- Create: `src/lib/allowedEmails.ts`
- Test: `src/lib/allowedEmails.test.ts`
- Create: `auth.ts` (repo root)
- Create: `app/api/auth/[...nextauth]/route.ts`

**Interfaces:**
- Produces: `isAllowedEmail(email: string | null | undefined, allowedEmailsEnv: string | undefined): boolean` — Task 14's admin page/action and Task 17's Puck save action both call this. `auth()`, `signIn()`, `signOut()`, `handlers` from `auth.ts` — Task 14's middleware and admin page import `auth`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/allowedEmails.test.ts
import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from './allowedEmails';

describe('isAllowedEmail', () => {
  it('allows an email on the list, case-insensitively', () => {
    expect(isAllowedEmail('Owner@Example.com', 'owner@example.com, other@example.com')).toBe(true);
  });

  it('rejects an email not on the list', () => {
    expect(isAllowedEmail('stranger@example.com', 'owner@example.com')).toBe(false);
  });

  it('rejects when the allow-list env var is missing', () => {
    expect(isAllowedEmail('owner@example.com', undefined)).toBe(false);
  });

  it('rejects when there is no email', () => {
    expect(isAllowedEmail(null, 'owner@example.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/allowedEmails.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `allowedEmails.ts`**

```ts
// src/lib/allowedEmails.ts
export function isAllowedEmail(
  email: string | null | undefined,
  allowedEmailsEnv: string | undefined,
): boolean {
  if (!email || !allowedEmailsEnv) return false;
  const allowed = allowedEmailsEnv
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/lib/allowedEmails.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify current Auth.js v5 API against its docs before writing `auth.ts`**

Auth.js v5 is still evolving faster than most dependencies in this project. Before writing the file below, check `https://authjs.dev/getting-started/migrating-to-v5` (or the installed package's own README under `node_modules/next-auth`) to confirm: the export shape (`{ handlers, auth, signIn, signOut }` from a single `NextAuth(...)` call), the `signIn` callback signature, and the Google provider's expected config keys. Adjust the code below if the installed version's API has moved on from this shape.

- [ ] **Step 6: Implement `auth.ts`**

```ts
// auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAllowedEmail } from './src/lib/allowedEmails';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return isAllowedEmail(user.email, process.env.ALLOWED_EMAILS);
    },
  },
});
```

- [ ] **Step 7: Implement the route handler**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '../../../../auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 8: Tell the user which env vars to add** (do not touch `.env` yourself — see Global Constraints)

Ask the user to add to their Netlify env vars (and local `.env`/`.env.local`):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from a Google Cloud OAuth client they create, with the redirect URI set to `<site-url>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local dev).
- `ALLOWED_EMAILS` — comma-separated list, e.g. `truongnam307@gmail.com`.
- `NEXTAUTH_SECRET` — already generated earlier in this conversation via `openssl rand -base64 32`; confirm it's present, or note the Auth.js v5 preferred name (`AUTH_SECRET`) if Step 5's doc check shows v5 has moved off `NEXTAUTH_SECRET`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/allowedEmails.ts src/lib/allowedEmails.test.ts auth.ts "app/api/auth/[...nextauth]/route.ts" package.json package-lock.json
git commit -m "Add Google OAuth via NextAuth.js with an allow-listed signIn callback"
```

---

### Task 14: `middleware.ts` + bare admin route (raw JSON editor, proves the save path)

**Files:**
- Create: `middleware.ts` (repo root)
- Create: `app/admin/page.tsx`
- Create: `app/admin/actions.ts`
- Create: `src/components/AdminEditorPlaceholder.tsx`

**Interfaces:**
- Consumes: `auth` from `auth.ts` (Task 13), `isAllowedEmail` (Task 13), `getPortfolioContent`/`savePortfolioContent` (Task 11).
- Produces: `saveContentAction(data: PortfolioData): Promise<void>` server action — this specific bare-editor action is replaced in Task 17 by a per-tab `saveTabBlocksAction`; nothing later depends on `saveContentAction`'s name.

- [ ] **Step 1: Implement `middleware.ts`**

```ts
// middleware.ts
import { auth } from './auth';

export default auth((req) => {
  const isProtected = req.nextUrl.pathname.startsWith('/admin');
  if (isProtected && !req.auth) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 2: Implement `app/admin/actions.ts`**

```ts
// app/admin/actions.ts
'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { savePortfolioContent } from '../../src/lib/portfolioContent';
import type { PortfolioData } from '../../src/types';

export async function saveContentAction(data: PortfolioData): Promise<void> {
  const session = await auth();
  // Re-check server-side even though middleware already gates /admin — this
  // action can in principle be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  await savePortfolioContent(data);
}
```

- [ ] **Step 3: Implement `AdminEditorPlaceholder.tsx`**

```tsx
// src/components/AdminEditorPlaceholder.tsx
'use client';

import { useState } from 'react';
import type { PortfolioData } from '../types';
import { saveContentAction } from '../../app/admin/actions';

interface Props {
  initialData: PortfolioData;
}

export function AdminEditorPlaceholder({ initialData }: Props) {
  const [text, setText] = useState(JSON.stringify(initialData, null, 2));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function handleSave() {
    setStatus('saving');
    try {
      const parsed = JSON.parse(text) as PortfolioData;
      await saveContentAction(parsed);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={30}
        style={{ width: '100%', fontFamily: 'monospace' }}
      />
      <button type="button" onClick={handleSave}>
        Save
      </button>
      {status === 'saving' && <p>Saving…</p>}
      {status === 'saved' && <p>Saved.</p>}
      {status === 'error' && <p>Save failed — check the JSON is valid.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/admin/page.tsx`**

```tsx
// app/admin/page.tsx
import { auth } from '../../auth';
import { getPortfolioContent } from '../../src/lib/portfolioContent';
import { AdminEditorPlaceholder } from '../../src/components/AdminEditorPlaceholder';

export default async function AdminPage() {
  const session = await auth();
  const data = await getPortfolioContent();

  return (
    <div className="wrap">
      <p>Signed in as {session?.user?.email}</p>
      <AdminEditorPlaceholder initialData={data} />
    </div>
  );
}
```

- [ ] **Step 5: Manual end-to-end verification (this path has no automated OAuth test — see below)**

Run: `npm run dev`, then in a browser:
1. Visit `/admin` while signed out — confirm it redirects to the sign-in page rather than showing content.
2. Sign in with a Google account **not** on `ALLOWED_EMAILS` — confirm access is still denied (the `signIn` callback in `auth.ts` returns `false` for it).
3. Sign in with the allow-listed account — confirm `/admin` loads, showing "Signed in as `<email>`" and the raw JSON.
4. Edit a value in the textarea (e.g. `footer`), click Save, confirm "Saved." appears.
5. Reload `/` (the public page) — confirm the edited value now appears there.

This is manual rather than automated because it exercises a real Google OAuth round-trip, which isn't meaningfully testable without a live provider; the pieces that *are* automatable (`isAllowedEmail`, the Blobs read/write/history behavior) already have tests from Tasks 11 and 13.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/admin/ src/components/AdminEditorPlaceholder.tsx
git commit -m "Add auth-gated /admin route with a raw JSON editor, proving the save path"
```

Phase 2 is now complete and independently shippable: a real person can sign in with an allow-listed Google account and edit live content, with every save snapshotted.

---

## Phase 3: Puck + Puck AI

### Task 15: Verify Puck's current API, install packages, build `puck.config.tsx`

**Files:**
- Create: `puck.config.tsx` (repo root, matching Puck's own recipe convention)

**Interfaces:**
- Produces: `puckConfig: Config` — Task 17's `PuckAdmin` component imports this.

**This task's code was reconciled against the official `puck` skill** (installed via `npx skills add puckeditor/skills --skill puck` — read `.agents/skills/puck/SKILL.md` and `references/config-authoring.md` before touching this file if either has changed since). Two things from that skill this task deliberately does NOT follow, recorded here so a reviewer doesn't flag them as gaps:

- The skill's default pattern stores content as Puck's own `Data` shape and renders the public page with `<Render>`. This app already has its own `Block[]` content model from Phase 1 (which shipped before Puck was even a dependency), and the public page already renders it via `BlockRenderer`/`TabbedContent`. Per the skill's own principle ("the app owns the data — there is no hosted content store"), keeping `Block[]` as the stored format and using Puck only as an editing surface over a transient view of it is the correct choice here, not a shortcut — Task 16's adapter is the bridge, with its own round-trip fidelity test guarding the one risk this approach introduces.
- The skill's `/edit`-suffix + middleware-rewrite pattern (any page editable in place) is designed for a general page tree. This app has exactly seven fixed tabs, not an arbitrary page tree, so a single fixed `/admin` route with a tab selector (Task 17) is the simpler correct shape for this problem, not a missed convention.

- [ ] **Step 1: Verify Puck's current API before writing config code**

Fetch `https://puckeditor.com/docs/integrating-puck/component-configuration.md` and `https://puckeditor.com/docs/api-reference/fields/array.md` (per the puck skill's "docs first" principle — the `.md` suffix on any puckeditor.com docs URL returns markdown) to confirm: the `Config<Props>` generic shape, the `array` field's `arrayFields`/`defaultItemProps`/`getItemSummary` options, and the `select`/`radio` field option shapes. The code below matches what these docs showed as of this plan being written — confirm nothing has changed before proceeding, and adjust field option names if it has. Also run `npm ls @puckeditor/core` after Step 2 to confirm the installed version, since the package scope changed once already (`@measured/puck` → `@puckeditor/core` in 0.21).

- [ ] **Step 2: Install Puck**

```bash
npm install @puckeditor/core@^1
```

- [ ] **Step 3: Implement `puck.config.tsx`**

Typed with `Config<Props>` (per the puck skill's config-authoring guidance) so `fields` and `render` params stay in sync, and carrying `ai.instructions` on every free-text field — this is the config-level half of the content-fidelity guardrail (the other half is `ai.context` on the server handler in Task 18). These instructions are derived directly from this app's real constraint (no rewriting real CV content), not invented tone/brand rules.

```tsx
// puck.config.tsx
import type { Config } from '@puckeditor/core';
import { JobCard } from './src/components/JobCard';
import { PlaceholderCard } from './src/components/PlaceholderCard';
import { EducationCard } from './src/components/EducationCard';
import { CertificateGroup } from './src/components/CertificateGroup';
import { GalleryTile } from './src/components/GalleryTile';
import { Note } from './src/components/Note';

type BulletItem = { text: string };
const bulletsField = {
  type: 'array' as const,
  arrayFields: { text: { type: 'textarea' as const } },
  defaultItemProps: { text: '' },
  getItemSummary: (item: BulletItem) => item.text || 'Bullet',
  ai: { instructions: 'Only add new bullets. Never edit or rewrite the text of an existing bullet.' },
};

type Props = {
  Job: { company: string; dates: string; role: string; bullets: BulletItem[] };
  Placeholder: { company: string; note: string };
  Education: { school: string; dates: string; degree: string; bullets: BulletItem[]; dissertation: string };
  CertificateGroup: { heading: string; certificates: { text: string; accent: boolean }[] };
  GalleryItem: { itemType: 'photo' | 'video'; image: string; videoUrl: string };
  Note: { text: string };
};

export const puckConfig: Config<Props> = {
  components: {
    Job: {
      ai: { instructions: 'One entry per job. Placement follows the order the editor arranges them in.' },
      fields: {
        company: { type: 'text', ai: { instructions: 'A real employer name — never invent or alter it.' } },
        dates: { type: 'text' },
        role: { type: 'text' },
        bullets: bulletsField,
      },
      defaultProps: { company: '', dates: '', role: '', bullets: [] },
      render: (props) => (
        <JobCard
          job={{
            type: 'job',
            company: props.company,
            dates: props.dates,
            role: props.role || undefined,
            bullets: props.bullets.map((b) => b.text),
          }}
        />
      ),
    },
    Placeholder: {
      fields: {
        company: { type: 'text' },
        note: { type: 'textarea' },
      },
      defaultProps: { company: '', note: '' },
      render: (props) => (
        <PlaceholderCard item={{ type: 'placeholder', company: props.company, note: props.note }} />
      ),
    },
    Education: {
      fields: {
        school: { type: 'text', ai: { instructions: 'A real institution name — never invent or alter it.' } },
        dates: { type: 'text' },
        degree: { type: 'text' },
        bullets: bulletsField,
        dissertation: { type: 'text' },
      },
      defaultProps: { school: '', dates: '', degree: '', bullets: [], dissertation: '' },
      render: (props) => (
        <EducationCard
          ed={{
            type: 'education',
            school: props.school,
            dates: props.dates,
            degree: props.degree,
            bullets: props.bullets.map((b) => b.text),
            dissertation: props.dissertation || undefined,
          }}
        />
      ),
    },
    CertificateGroup: {
      fields: {
        heading: { type: 'text' },
        certificates: {
          type: 'array',
          arrayFields: {
            text: { type: 'text' },
            accent: {
              type: 'radio',
              options: [
                { label: 'Accent', value: true },
                { label: 'Normal', value: false },
              ],
            },
          },
          defaultItemProps: { text: '', accent: false },
          getItemSummary: (item: { text: string }) => item.text || 'Certificate',
          ai: { instructions: 'Only add new certificates. Never edit or rewrite an existing certificate\'s text.' },
        },
      },
      defaultProps: { heading: 'Certificates', certificates: [] },
      render: (props) => (
        <CertificateGroup
          group={{ type: 'certificate-group', heading: props.heading, certificates: props.certificates }}
        />
      ),
    },
    GalleryItem: {
      fields: {
        itemType: {
          type: 'select',
          options: [
            { label: 'Photo', value: 'photo' },
            { label: 'Video', value: 'video' },
          ],
        },
        image: { type: 'text' },
        videoUrl: { type: 'text' },
      },
      defaultProps: { itemType: 'photo', image: '', videoUrl: '' },
      render: (props) => (
        <GalleryTile
          item={{
            type: 'gallery-item',
            itemType: props.itemType,
            image: props.image || undefined,
            videoUrl: props.videoUrl || undefined,
          }}
        />
      ),
    },
    Note: {
      fields: {
        text: { type: 'textarea', ai: { instructions: 'Only add new notes. Never rewrite existing note text.' } },
      },
      defaultProps: { text: '' },
      render: (props) => <Note text={props.text} />,
    },
  },
};
```

Note this task deliberately does not set `chat.examplePrompts` anywhere — per the puck skill, invented example prompts read as first-party product copy and should only be authored by the site owner, not generated.

- [ ] **Step 4: Verify it type-checks**

Run: `npm run check`
Expected: no new type errors from `puck.config.tsx` (this file has no test of its own — its correctness is exercised through `puckAdapter.test.ts` in Task 16 and manually in Task 17). If the installed version doesn't recognize a field-level `ai` key (it's a newer addition than some other Puck APIs), fall back to omitting it there and rely on the handler-level `ai.context` in Task 18 alone — note this in the task report if it happens.

- [ ] **Step 5: Commit**

```bash
git add puck.config.tsx package.json package-lock.json
git commit -m "Add Puck config mapping block components to editable fields"
```

---

### Task 16: `puckAdapter.ts` — Block ⇄ Puck data, with a round-trip fidelity test

**Files:**
- Create: `src/lib/puckAdapter.ts`
- Test: `src/lib/puckAdapter.test.ts`

**Interfaces:**
- Consumes: `Block` from `src/types.ts`.
- Produces: `blocksToPuckData(blocks: Block[]): Data`, `puckDataToBlocks(data: Data): Block[]` — Task 17's `PuckAdmin` component calls both.

- [ ] **Step 1: Write the failing round-trip test**

This is the most safety-critical test in Phase 3: a lossy round-trip here would silently corrupt real content the next time someone saves through Puck.

```ts
// src/lib/puckAdapter.test.ts
import { describe, expect, it } from 'vitest';
import { blocksToPuckData, puckDataToBlocks } from './puckAdapter';
import type { Block } from '../types';

describe('puckAdapter', () => {
  it('round-trips every block type without losing or altering data', () => {
    const blocks: Block[] = [
      { type: 'job', company: 'Acme', dates: '2020–2021', role: 'Engineer', bullets: ['Did a thing.', 'Did another.'] },
      { type: 'placeholder', company: 'TBD Co', note: 'Add details.' },
      { type: 'education', school: 'Somewhere U', dates: '2018–2020', degree: 'MA', bullets: ['Distinction.'], dissertation: 'A thesis.' },
      {
        type: 'certificate-group',
        heading: 'Certificates',
        certificates: [{ text: 'IELTS 8.0', accent: true }, { text: 'HSK 3', accent: false }],
      },
      { type: 'gallery-item', itemType: 'photo', image: 'https://example.com/p.jpg' },
      { type: 'note', text: 'Nothing here yet.' },
    ];

    const roundTripped = puckDataToBlocks(blocksToPuckData(blocks));
    expect(roundTripped).toEqual(blocks);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/lib/puckAdapter.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `puckAdapter.ts`**

```ts
// src/lib/puckAdapter.ts
import type { Data, ComponentData } from '@puckeditor/core';
import type { Block } from '../types';

const BLOCK_TO_PUCK_COMPONENT: Record<Block['type'], string> = {
  job: 'Job',
  placeholder: 'Placeholder',
  education: 'Education',
  'certificate-group': 'CertificateGroup',
  'gallery-item': 'GalleryItem',
  note: 'Note',
};

const PUCK_COMPONENT_TO_BLOCK_TYPE: Record<string, Block['type']> = Object.fromEntries(
  Object.entries(BLOCK_TO_PUCK_COMPONENT).map(([blockType, componentName]) => [
    componentName,
    blockType as Block['type'],
  ]),
);

const toPuckBullets = (bullets: string[] = []) => bullets.map((text) => ({ text }));
const fromPuckBullets = (items: { text: string }[] = []) => items.map((i) => i.text);

function blockToPuckProps(block: Block): Record<string, unknown> {
  switch (block.type) {
    case 'job':
      return { company: block.company, dates: block.dates, role: block.role ?? '', bullets: toPuckBullets(block.bullets) };
    case 'placeholder':
      return { company: block.company, note: block.note };
    case 'education':
      return {
        school: block.school,
        dates: block.dates,
        degree: block.degree,
        bullets: toPuckBullets(block.bullets),
        dissertation: block.dissertation ?? '',
      };
    case 'certificate-group':
      return { heading: block.heading, certificates: block.certificates };
    case 'gallery-item':
      return { itemType: block.itemType, image: block.image ?? '', videoUrl: block.videoUrl ?? '' };
    case 'note':
      return { text: block.text };
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function blocksToPuckData(blocks: Block[]): Data {
  return {
    content: blocks.map((block, i) => ({
      type: BLOCK_TO_PUCK_COMPONENT[block.type],
      props: { id: `${block.type}-${i}`, ...blockToPuckProps(block) },
    })),
    root: {},
  };
}

export function puckDataToBlocks(data: Data): Block[] {
  return (data.content as ComponentData[]).map((item): Block => {
    const blockType = PUCK_COMPONENT_TO_BLOCK_TYPE[item.type];
    const props = item.props as Record<string, any>;
    switch (blockType) {
      case 'job':
        return {
          type: 'job',
          company: props.company,
          dates: props.dates,
          role: props.role || undefined,
          bullets: fromPuckBullets(props.bullets),
        };
      case 'placeholder':
        return { type: 'placeholder', company: props.company, note: props.note };
      case 'education':
        return {
          type: 'education',
          school: props.school,
          dates: props.dates,
          degree: props.degree,
          bullets: fromPuckBullets(props.bullets),
          dissertation: props.dissertation || undefined,
        };
      case 'certificate-group':
        return { type: 'certificate-group', heading: props.heading, certificates: props.certificates };
      case 'gallery-item':
        return {
          type: 'gallery-item',
          itemType: props.itemType,
          image: props.image || undefined,
          videoUrl: props.videoUrl || undefined,
        };
      case 'note':
        return { type: 'note', text: props.text };
      default:
        throw new Error(`Unknown Puck component type: ${item.type}`);
    }
  });
}
```

- [ ] **Step 4: Run test, confirm it passes**

Run: `npx vitest run src/lib/puckAdapter.test.ts`
Expected: PASS. If it fails on the `job`/`education` cases specifically, check whether `role`/`dissertation` round-trip `''` vs `undefined` consistently — the test's fixtures deliberately include both a present and an absent optional field per type to catch exactly this class of bug.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puckAdapter.ts src/lib/puckAdapter.test.ts
git commit -m "Add Block <-> Puck data adapter with a round-trip fidelity test"
```

---

### Task 17: Real per-tab Puck editor at `/admin`

**Files:**
- Create: `src/components/PuckAdmin.tsx`
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/actions.ts`
- Delete: `src/components/AdminEditorPlaceholder.tsx`

**Interfaces:**
- Consumes: `puckConfig` (Task 15), `blocksToPuckData`/`puckDataToBlocks` (Task 16), `getPortfolioContent`/`savePortfolioContent` (Task 11), `isAllowedEmail` (Task 13).
- Produces: `saveTabBlocksAction(tabKey: keyof PortfolioData['tabs'], blocks: Block[]): Promise<void>` — Task 18's AI handler route does not call this directly, but shares the same auth/save path conceptually.

- [ ] **Step 1: Add `saveTabBlocksAction` to `app/admin/actions.ts`**, replacing `saveContentAction`

```ts
// app/admin/actions.ts
'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { getPortfolioContent, savePortfolioContent } from '../../src/lib/portfolioContent';
import type { Block, PortfolioData } from '../../src/types';

export async function saveTabBlocksAction(
  tabKey: keyof PortfolioData['tabs'],
  blocks: Block[],
): Promise<void> {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  const current = await getPortfolioContent();
  const updated: PortfolioData = {
    ...current,
    tabs: { ...current.tabs, [tabKey]: { ...current.tabs[tabKey], blocks } },
  };
  await savePortfolioContent(updated);
}
```

- [ ] **Step 2: Implement `PuckAdmin.tsx`**

Per the puck skill's Next.js App Router guidance: `<Puck>`'s CSS must be imported from the _server_ parent page, not this client child, so it ends up in the document Puck syncs into its preview iframe — importing it here would leave the canvas unstyled. The import lives in `app/admin/page.tsx` (Step 3), not this file.

```tsx
// src/components/PuckAdmin.tsx
'use client';

import { useState } from 'react';
import { Puck } from '@puckeditor/core';
import { puckConfig } from '../../puck.config';
import { blocksToPuckData, puckDataToBlocks } from '../lib/puckAdapter';
import { saveTabBlocksAction } from '../../app/admin/actions';
import type { PortfolioData } from '../types';

const TAB_ORDER: { key: keyof PortfolioData['tabs']; label: string }[] = [
  { key: 'teaching', label: 'Teaching' },
  { key: 'internationalEducation', label: 'International Education' },
  { key: 'testing', label: 'Testing' },
  { key: 'academicBackground', label: 'Academic Background' },
  { key: 'publications', label: 'Publications' },
  { key: 'talks', label: 'Talks' },
  { key: 'media', label: 'Media' },
];

interface Props {
  initialData: PortfolioData;
}

export function PuckAdmin({ initialData }: Props) {
  const [activeKey, setActiveKey] = useState(TAB_ORDER[0].key);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const activeTab = initialData.tabs[activeKey];

  async function handlePublish(data: Parameters<typeof puckDataToBlocks>[0]) {
    setStatus('saving');
    try {
      const blocks = puckDataToBlocks(data);
      await saveTabBlocksAction(activeKey, blocks);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div>
      <nav className="tabs">
        {TAB_ORDER.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveKey(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      {status === 'saved' && <p>Saved.</p>}
      {status === 'error' && <p>Save failed.</p>}
      {/* key={activeKey} forces a remount with fresh `data` when switching tabs —
          Puck owns its state internally after mount, so this is how a new
          initial document gets loaded. `data` must not change after `<Puck>`
          mounts (per the puck skill) — remounting via `key` is the supported
          way to load a different document, not a workaround. */}
      {/* height leaves room for the "Signed in as" line above it — <Puck> defaults
          to 100dvh, which would otherwise push part of the editor off-screen. */}
      <Puck
        key={activeKey}
        config={puckConfig}
        data={blocksToPuckData(activeTab.blocks)}
        onPublish={handlePublish}
        height="calc(100dvh - 3rem)"
      />
    </div>
  );
}
```

- [ ] **Step 3: Update `app/admin/page.tsx`**

`dynamic = 'force-dynamic'` and the `puck.css` import both belong here per the puck skill's Next.js App Router guidance — the editor route must not be statically rendered (it needs a fresh session/content read every visit), and the CSS import must live in this server page so it reaches the iframe Puck syncs styles into.

```tsx
// app/admin/page.tsx
import '@puckeditor/core/puck.css';
import { auth } from '../../auth';
import { getPortfolioContent } from '../../src/lib/portfolioContent';
import { PuckAdmin } from '../../src/components/PuckAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();
  const data = await getPortfolioContent();

  return (
    <div>
      <p className="wrap">Signed in as {session?.user?.email}</p>
      <PuckAdmin initialData={data} />
    </div>
  );
}
```

- [ ] **Step 4: Remove the bare placeholder editor**

```bash
git rm src/components/AdminEditorPlaceholder.tsx
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, sign in at `/admin` as the allow-listed user, and confirm:
1. Each of the seven tab buttons loads that tab's real content into the Puck editor.
2. Editing a field (e.g. a job's `dates`) and clicking Publish shows "Saved.", and reloading `/` reflects the change.
3. Adding/removing/reordering items in a `bullets` array field works and survives a save (this exercises the adapter's array handling specifically).

- [ ] **Step 6: Commit**

```bash
git add app/admin/ src/components/PuckAdmin.tsx
git commit -m "Replace the bare JSON editor with a real per-tab Puck editor"
```

---

### Task 18: Wire Puck AI (scaffolding-only), note the Claude-BYOK open question

**Files:**
- Modify: `src/components/PuckAdmin.tsx`
- Create: `app/api/puck/[...all]/route.ts`
- Modify: `middleware.ts`

**Interfaces:** none new — this task adds a plugin/route, it doesn't change any function signature other tasks depend on.

- [ ] **Step 1: Install Puck AI packages**

```bash
npm install @puckeditor/plugin-ai@^1 @puckeditor/cloud-client@^1
```

- [ ] **Step 2: Extend `middleware.ts` to also gate the AI handler route**

```ts
// middleware.ts
import { auth } from './auth';

export default auth((req) => {
  const isProtected =
    req.nextUrl.pathname.startsWith('/admin') || req.nextUrl.pathname.startsWith('/api/puck');
  if (isProtected && !req.auth) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/admin/:path*', '/api/puck/:path*'],
};
```

- [ ] **Step 3: Implement `app/api/puck/[...all]/route.ts`**

**Open question, resolve before finalizing this step:** the site owner wants to use their own Claude API key (BYOK) instead of Puck's default OpenAI-backed models/credits. Puck's published BYOK docs (`puckeditor.com/docs/ai/model-configuration`) only show OpenAI example model strings (e.g. `"openai/gpt-5.5"`) alongside a `providerApiKey`; no confirmed Anthropic/Claude example was found, and BYOK itself requires a Launch-tier Puck Cloud plan or above. Before writing the final `model`/`providerApiKey` values below: try `model: "anthropic/claude-sonnet-5"` with the user's Claude key on their Puck Cloud account and confirm it's accepted. **If Claude BYOK is not supported, fall back to Puck's default model/credits** (omit `model`/`providerApiKey` entirely) rather than blocking this task on it.

```ts
// app/api/puck/[...all]/route.ts
import { puckHandler } from '@puckeditor/cloud-client';
import { auth } from '../../../../auth';
import { isAllowedEmail } from '../../../../src/lib/allowedEmails';

const AI_CONTEXT =
  "You are helping edit a real person's CV/portfolio page. Only scaffold new content blocks, " +
  'reorder or restructure layout, or propose new empty blocks to fill in later. Never generate, ' +
  'rewrite, or rephrase existing text in company names, job bullets, education details, or any ' +
  'other real content field — those are factual claims about a real career and must only ever be ' +
  'written or edited by a human.';

async function handleRequest(request: Request) {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    return new Response('Not authorized', { status: 403 });
  }

  // Resolved per the open question above: set model/providerApiKey here only if
  // Claude BYOK was confirmed to work; otherwise omit both and Puck uses its
  // own default model and credits.
  return puckHandler(request, {
    ai: {
      context: AI_CONTEXT,
      // Locks Puck AI to composing from this app's own config components —
      // "design" mode can invent new custom-styled sections, which would
      // both risk drifting off the fixed navy/graphite/mint design tokens
      // and bypass the per-field ai.instructions guardrails in puck.config.tsx.
      mode: 'assembly',
    },
  });
}

export const DELETE = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
```

- [ ] **Step 4: Wire the AI plugin into `PuckAdmin.tsx` and its CSS into `app/admin/page.tsx`**

Same reasoning as Task 17 Step 2/3: the AI plugin's stylesheet needs to reach the server parent, not the client child, for the same iframe-syncing reason as Puck's core CSS.

```tsx
// src/components/PuckAdmin.tsx — add these two imports and the plugin instance
import { createAiPlugin } from '@puckeditor/plugin-ai';

const aiPlugin = createAiPlugin();
```

```tsx
// app/admin/page.tsx — add this import alongside the existing puck.css import
import '@puckeditor/plugin-ai/styles.css';
```

Then add `plugins={[aiPlugin]}` to the `<Puck>` element from Task 17:

```tsx
<Puck
  key={activeKey}
  config={puckConfig}
  data={blocksToPuckData(activeTab.blocks)}
  onPublish={handlePublish}
  plugins={[aiPlugin]}
/>
```

- [ ] **Step 5: Manual verification of the content-fidelity guardrail**

Run: `npm run dev`, sign in at `/admin`, open the AI chat interface Puck AI adds to the editor, and:
1. Ask it to add a new empty block or rearrange existing blocks — confirm it does this.
2. Ask it directly to "rewrite this job's bullet points to sound more impressive" — confirm the `context` steers it to refuse or redirect, rather than silently rewriting real content. **This is a prompt-level guardrail, not a hard technical block** — if the model doesn't reliably refuse, the real backstop is Task 11's history snapshots (any bad edit is recoverable) and the fact that only the allow-listed owner has access at all. Note the observed behavior either way; if the model doesn't respect the guardrail, flag this to the user rather than silently shipping it.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts "app/api/puck/[...all]/route.ts" src/components/PuckAdmin.tsx package.json package-lock.json
git commit -m "Wire Puck AI with a scaffolding-only content-fidelity guardrail"
```

---

### Task 19: Update `CLAUDE.md` and `README.md` for the final architecture

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Rewrite `CLAUDE.md`'s "The one invariant" section**

Replace the Astro-specific description with: this is now a Next.js (App Router) site deployed via `@netlify/plugin-nextjs`; content lives in Netlify Blobs (seeded from `content/portfolio.json` on first deploy), not directly in a git-tracked file; `npm run build` runs `next build`. Keep the spirit of the original section (there is still exactly one place content lives and one build command) but describe the new reality accurately.

- [ ] **Step 2: Rewrite `CLAUDE.md`'s "No admin panel" section**

Replace it with a section documenting: this admin panel exists deliberately (link to `docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md`), who can access it (Google OAuth + `ALLOWED_EMAILS`), and the content-fidelity guardrail on Puck AI (scaffolding-only via the `context` prompt in `app/api/puck/[...all]/route.ts`, backstopped by history snapshots — not a hard technical block). State explicitly that this is not leftover cruft to be removed — it is the intended editing surface now — so a future session doesn't misread it as the old Sveltia CMS and tear it out again.

- [ ] **Step 3: Update `README.md`**

Update the "Deploying" section (server rendering via `@netlify/plugin-nextjs`, no `publish` dir), add a new "Admin panel" section describing `/admin`, its auth requirement, and the env vars it needs (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `PUCK_API_KEY`), and update "Editing content" to mention `/admin` as the primary path, with direct `content/portfolio.json` edits only affecting the seed value used on a from-scratch deploy.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Document the Next.js/Puck admin panel architecture in CLAUDE.md and README"
```

---

### Task 20: Final end-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Full automated check**

Run: `npm run check && npm run lint && npm run test && npm run build`
Expected: all green.

- [ ] **Step 2: Full manual checklist**

1. Public page: every tab renders correctly, visually matching the pre-migration site.
2. `/admin` signed out → redirected to sign-in.
3. `/admin` signed in with a non-allow-listed Google account → still denied.
4. `/admin` signed in with the allow-listed account → Puck loads real content per tab.
5. Edit and publish a change in one tab → public page reflects it, a new `history/{timestamp}.json` snapshot exists in the Blob store.
6. Puck AI: scaffolding actions work; a direct "rewrite this text" request is steered away per the `context` guardrail (or, per Task 18 Step 5, flagged if it isn't).
7. Confirm whether Claude BYOK was resolved (Task 18's open question) — if unresolved, confirm the fallback to Puck's default model is in place and working, not left half-configured.

- [ ] **Step 3: Report back to the user**

Summarize what was built, any deviations from the spec discovered during implementation (e.g. the `certificate-group` block type, the `itemType` rename), and the resolution (or non-resolution) of the Claude BYOK open question, so they can decide whether to merge `feature/nextjs-puck-admin-panel` into `main`.
