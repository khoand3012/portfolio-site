import { describe, expect, it } from 'vitest';
import { puckConfig } from '../../puck.config';
import type { Block } from '../types';
import {
  blocksToPuckData,
  KNOWN_COMPONENT_NAMES,
  puckDataToBlocks,
} from './puckAdapter';

describe('puckAdapter', () => {
  it('round-trips every block type without losing or altering data', () => {
    const blocks: Block[] = [
      {
        type: 'job',
        company: 'Acme',
        dates: '2020–2021',
        role: 'Engineer',
        bullets: ['Did a thing.', 'Did another.'],
      },
      { type: 'placeholder', company: 'TBD Co', note: 'Add details.' },
      {
        type: 'education',
        school: 'Somewhere U',
        dates: '2018–2020',
        degree: 'MA',
        bullets: ['Distinction.'],
        dissertation: 'A thesis.',
      },
      {
        type: 'certificate-group',
        heading: 'Certificates',
        certificates: [
          { text: 'IELTS 8.0', accent: true },
          { text: 'HSK 3', accent: false },
        ],
      },
      {
        type: 'gallery-item',
        itemType: 'photo',
        image: 'https://example.com/p.jpg',
      },
      { type: 'note', text: 'Nothing here yet.' },
    ];

    const roundTripped = puckDataToBlocks(blocksToPuckData(blocks));
    expect(roundTripped).toEqual(blocks);
  });

  // Closes the type-drift risk the round-trip test above can't catch: that
  // test only round-trips the adapter's own two functions against each
  // other, so it would still pass unchanged even if puck.config.tsx renamed
  // a component (e.g. GalleryItem -> Gallery) — silently breaking that
  // block type's publish path in production. This test imports the REAL
  // puckConfig from puck.config.tsx and asserts, at the data level, that
  // the set of component names puckAdapter.ts knows how to handle
  // (KNOWN_COMPONENT_NAMES) is exactly the set of components actually
  // configured for the live editor.
  it('knows how to handle exactly the component names configured in the real puck.config.tsx', () => {
    const configuredComponentNames = Object.keys(puckConfig.components).sort();
    expect([...KNOWN_COMPONENT_NAMES].sort()).toEqual(configuredComponentNames);
  });
});
