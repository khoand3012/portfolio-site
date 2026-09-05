import { describe, expect, it } from 'vitest';
import { deriveSlugs } from './tabSlugs';

describe('deriveSlugs', () => {
  it('slugifies labels', () => {
    expect(deriveSlugs([{ label: 'International Education' }])).toEqual([
      'international-education',
    ]);
  });

  it('disambiguates duplicate labels by index', () => {
    expect(deriveSlugs([{ label: 'Talks' }, { label: 'Talks' }])).toEqual([
      'talks',
      'talks-1',
    ]);
  });

  it('falls back for a label with no alphanumerics', () => {
    expect(deriveSlugs([{ label: '—' }])).toEqual(['tab-0']);
  });

  // Phase A shipped a version that suffixed a colliding slug but never
  // registered the suffixed result, so a later label that happened to
  // slugify to that same suffixed form collided with it. Unreachable then
  // (seven fixed labels, no way to add or rename a tab); reachable the
  // moment the tab manager lands, and the cost is duplicate DOM ids plus
  // duplicate React keys in TabbedContent.
  it('does not collide when a label already looks like a suffixed slug', () => {
    expect(
      deriveSlugs([
        { label: 'Talks' },
        { label: 'Talks' },
        { label: 'Talks 1' },
      ]),
    ).toEqual(['talks', 'talks-1', 'talks-1-2']);
  });

  it('keeps every slug unique across a pathological label set', () => {
    const slugs = deriveSlugs([
      { label: 'A' },
      { label: 'A' },
      { label: 'A-1' },
      { label: 'A 1' },
      { label: '' },
      { label: '!!!' },
      { label: 'a' },
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
