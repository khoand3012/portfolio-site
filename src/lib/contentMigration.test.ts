import { describe, expect, it } from 'vitest';
import type { NewBlock } from '../types';
import v1Fixture from './__fixtures__/portfolio-v1.json';
import { migratePortfolioData } from './contentMigration';

/** Every string reachable in a v1 document, in document order. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object')
    for (const [key, v] of Object.entries(value)) {
      // `type`/`itemType` values are v1 schema discriminators ("job",
      // "gallery-item", "video"), not CV content. A migrated job becomes a
      // container, so the tag has no v2 field by design — asserting it
      // survives would test the schema, not the content it carries.
      if (key === 'type' || key === 'itemType') continue;
      collectStrings(v, out);
    }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flatten(blocks: NewBlock[], out: NewBlock[] = []): NewBlock[] {
  for (const block of blocks) {
    out.push(block);
    if (block.type === 'container') flatten(block.children, out);
  }
  return out;
}

const V1_TAB_KEYS = [
  'teaching',
  'internationalEducation',
  'testing',
  'academicBackground',
  'publications',
  'talks',
  'media',
] as const;

describe('migratePortfolioData', () => {
  it('loses no content when migrating the real v1 document', () => {
    const v2 = migratePortfolioData(v1Fixture);

    // A string's form in v2 depends on where it landed: rich-text fields
    // (text.html, bullets.items) are HTML-escaped on the way in, while
    // plain-text fields (heading.text, dates.text, badge.text, tab labels,
    // hero) keep it verbatim. Accept either — the claim under test is that
    // the content survives, not which field it survived into. Without the
    // escaped form this fails on the first "&" in a bullet; without the raw
    // form it fails on the first "&" in a company name.
    const assertSurvives = (
      original: string,
      haystack: string,
      where: string,
    ) => {
      const raw = JSON.stringify(original).slice(1, -1);
      const escaped = JSON.stringify(escapeHtml(original)).slice(1, -1);
      expect(
        haystack.includes(raw) || haystack.includes(escaped),
        `content lost during migration (${where}): ${original.slice(0, 80)}`,
      ).toBe(true);
    };

    // Checking each string against JSON.stringify(v2) (the whole document)
    // is too weak: the fixture has a job with role "Exams Operation Officer"
    // in the internationalEducation tab, and an unrelated job in the testing
    // tab whose company is "Exams Operation Officer — British Council
    // Vietnam". Company names land in v2 verbatim, so that substring is
    // present in the full document regardless of whether the role from the
    // *other* tab actually migrated — a dropped role would pass. Scoping
    // each tab's strings to that tab's own migrated subtree closes the hole.
    const v1Tabs = (v1Fixture as { tabs: Record<string, unknown> }).tabs;
    for (const key of V1_TAB_KEYS) {
      const v1Tab = v1Tabs[key];
      if (!v1Tab) continue;
      const v2Tab = v2.tabs.find((t) => t.id === key);
      const tabHaystack = JSON.stringify(v2Tab ?? null);
      for (const original of collectStrings(v1Tab)) {
        assertSurvives(original, tabHaystack, key);
      }
    }

    // hero and footer belong to no tab, so they're still checked against the
    // whole document.
    const wholeDocHaystack = JSON.stringify(v2);
    const v1Doc = v1Fixture as { hero: unknown; footer: unknown };
    for (const original of [
      ...collectStrings(v1Doc.hero),
      ...collectStrings(v1Doc.footer),
    ]) {
      assertSurvives(original, wholeDocHaystack, 'hero/footer');
    }
  });

  it('is deterministic — the same v1 input always yields identical output', () => {
    // Not a stylistic preference: saveTabBlocksAction looks tabs up by id in
    // a freshly-read document. Random ids here would break every save against
    // a not-yet-migrated document.
    expect(migratePortfolioData(v1Fixture)).toEqual(
      migratePortfolioData(v1Fixture),
    );
  });

  it('reuses the v1 tab key as the tab id', () => {
    const v2 = migratePortfolioData(v1Fixture);
    expect(v2.tabs.map((t) => t.id)).toEqual([
      'teaching',
      'internationalEducation',
      'testing',
      'academicBackground',
      'publications',
      'talks',
      'media',
    ]);
  });

  it('is idempotent — a v2 document passes through untouched', () => {
    const v2 = migratePortfolioData(v1Fixture);
    expect(migratePortfolioData(v2)).toEqual(v2);
  });

  it('escapes HTML metacharacters moving into rich-text fields', () => {
    const v2 = migratePortfolioData({
      hero: { name: 'N', initials: 'N', role: 'R', profile: 'P' },
      tabs: {
        teaching: {
          label: 'Teaching',
          blocks: [
            {
              type: 'job',
              company: 'Acme',
              dates: '2020',
              role: 'R&D Lead',
              bullets: ['Grew 5 < 10 teams & shipped <b>fast</b>.'],
            },
          ],
        },
      },
      footer: 'F',
    });
    const blocks = flatten(v2.tabs[0]?.blocks ?? []);
    const text = blocks.find((b) => b.type === 'text');
    const bullets = blocks.find((b) => b.type === 'bullets');
    expect(text).toEqual({
      type: 'text',
      html: '<p>R&amp;D Lead</p>',
      variant: 'subtitle',
    });
    expect(bullets).toEqual({
      type: 'bullets',
      items: [
        '<p>Grew 5 &lt; 10 teams &amp; shipped &lt;b&gt;fast&lt;/b&gt;.</p>',
      ],
    });
  });

  it('maps each v1 block type to its v2 shape', () => {
    const v2 = migratePortfolioData({
      hero: { name: 'N', initials: 'N', role: 'R', profile: 'P' },
      tabs: {
        teaching: {
          label: 'Teaching',
          blocks: [
            { type: 'job', company: 'Acme', dates: '2020' },
            { type: 'placeholder', company: 'TBD', note: 'Later.' },
            {
              type: 'education',
              school: 'U',
              dates: '2018',
              degree: 'MA',
              dissertation: 'Thesis.',
            },
            {
              type: 'certificate-group',
              heading: 'Certs',
              certificates: [{ text: 'IELTS 8.0', accent: true }],
            },
            { type: 'note', text: 'A note.' },
          ],
        },
        media: {
          label: 'Media',
          blocks: [
            { type: 'gallery-item', itemType: 'photo', image: 'p.jpg' },
            {
              type: 'gallery-item',
              itemType: 'video',
              videoUrl: 'https://v.example/x',
              image: 'poster.jpg',
            },
          ],
        },
      },
      footer: 'F',
    });

    const teaching = flatten(v2.tabs[0]?.blocks ?? []);
    // job 0 + placeholder note 1 + education degree/dissertation 2 + note 1 = 4.
    // The job here has no role and no bullets, so it yields neither a subtitle
    // nor a bullet list — empty optionals produce no child at all.
    expect(teaching.filter((b) => b.type === 'text')).toHaveLength(4);
    expect(teaching.filter((b) => b.type === 'bullets')).toHaveLength(0);
    expect(teaching.find((b) => b.type === 'dates')).toEqual({
      type: 'dates',
      text: '2020',
    });
    expect(teaching.find((b) => b.type === 'badge')).toEqual({
      type: 'badge',
      text: 'IELTS 8.0',
      accent: true,
    });

    // The media tab's blocks are wrapped in one grid container, preserving
    // the .gallery-grid look the removed wrapperClassName special case gave.
    const mediaTop = v2.tabs[1]?.blocks ?? [];
    expect(mediaTop).toHaveLength(1);
    expect(mediaTop[0]).toMatchObject({
      type: 'container',
      direction: 'grid',
      columns: 'auto',
    });
    const media = flatten(mediaTop);
    expect(media.find((b) => b.type === 'image')).toEqual({
      type: 'image',
      src: 'p.jpg',
    });
    expect(media.find((b) => b.type === 'video')).toEqual({
      type: 'video',
      mode: 'link',
      url: 'https://v.example/x',
      poster: 'poster.jpg',
    });
  });

  it('throws on a document that is neither v1 nor v2', () => {
    expect(() => migratePortfolioData({ nonsense: true })).toThrow(
      /unrecognized/i,
    );
    expect(() => migratePortfolioData(null)).toThrow(/unrecognized/i);
  });
});
