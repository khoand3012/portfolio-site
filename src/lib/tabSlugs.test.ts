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
});
