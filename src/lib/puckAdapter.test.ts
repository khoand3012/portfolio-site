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
