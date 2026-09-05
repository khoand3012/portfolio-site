import { describe, expect, it } from 'vitest';
import { puckConfig } from '../../puck.config';
import type { Block } from '../types';
import {
  blocksToPuckData,
  KNOWN_COMPONENT_NAMES,
  puckDataToBlocks,
} from './puckAdapter';

const container = (children: Block[], over: Partial<Block> = {}): Block =>
  ({
    type: 'container',
    children,
    direction: 'stack',
    gap: 'md',
    padding: 'lg',
    marginBottom: 'lg',
    align: 'baseline',
    justify: 'between',
    columns: 'auto',
    wrap: true,
    surface: 'card',
    ...over,
  }) as Block;

function collectIds(
  content: { props: { id: string }; [k: string]: unknown }[],
): string[] {
  const out: string[] = [];
  for (const item of content) {
    out.push(item.props.id);
    const children = (item.props as { children?: typeof content }).children;
    if (children) out.push(...collectIds(children));
  }
  return out;
}

describe('puckAdapter', () => {
  const blocks: Block[] = [
    container([
      container([
        { type: 'heading', text: 'Acme', level: 'h3' },
        { type: 'dates', text: '2020 – 2021' },
      ]),
      { type: 'text', html: '<p>Engineer</p>', variant: 'subtitle' },
      {
        type: 'bullets',
        items: ['<p>Did a thing.</p>', '<p>And another.</p>'],
      },
      { type: 'badge', text: 'IELTS 8.0', accent: true, year: '2025' },
      { type: 'image', src: 'https://x.example/a.jpg', alt: 'A', caption: 'C' },
      {
        type: 'video',
        mode: 'embed',
        url: 'https://x.example/a.mp4',
        poster: 'https://x.example/p.jpg',
        caption: 'V',
      },
    ]),
  ];

  it('round-trips a nested tree without losing or altering data', () => {
    expect(puckDataToBlocks(blocksToPuckData(blocks))).toEqual(blocks);
  });

  it('gives every node a unique id across the whole tree', () => {
    // The round-trip test cannot catch this: Block carries no id, so a tree
    // with duplicate Puck ids round-trips perfectly while the editor's
    // selection and drag-and-drop misbehave.
    const ids = collectIds(
      blocksToPuckData(blocks).content as never as {
        props: { id: string };
      }[],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(5);
  });

  it('collapses every container-shaped component to one stored type', () => {
    for (const type of ['Container', 'EntryCard', 'BadgeRow', 'MediaGrid']) {
      const [block] = puckDataToBlocks({
        root: {},
        content: [
          {
            type,
            props: {
              id: 'x',
              children: [],
              direction: 'stack',
              gap: 'md',
              padding: 'none',
              marginBottom: 'none',
              align: 'stretch',
              justify: 'start',
              columns: 'auto',
              wrap: false,
              surface: 'none',
            },
          },
        ],
      } as never);
      expect(block?.type).toBe('container');
    }
  });

  it('refuses data carrying legacy zones rather than dropping their content', () => {
    expect(() =>
      puckDataToBlocks({
        root: {},
        content: [],
        zones: { 'some-id:zone': [] },
      } as never),
    ).toThrow(/zones/i);
  });

  it('recognizes exactly the components configured in puck.config.tsx', () => {
    expect([...KNOWN_COMPONENT_NAMES].sort()).toEqual(
      Object.keys(puckConfig.components).sort(),
    );
  });
});

// Regression guard for a real defect found in the phase A final review.
//
// The preset components (EntryCard/BadgeRow/MediaGrid) pre-seed slot children
// through defaultProps. Those children must carry NO `id`: Puck's
// insertAction calls populateIds(data, config) with two arguments, so its
// `override` parameter defaults to false, and that branch's child mapper is
// `{ ...{ id: generated }, ...item.props }` — spreading the item's own props
// last. An `id` written into defaultProps therefore wins over the generated
// one and survives verbatim into every insert, so two EntryCards would share
// ids for their title row, heading, dates, subtitle and bullets. Puck keys
// its node index and its slot zone compounds (`${parentId}:${propName}`) by
// id, so the second card would alias the first.
//
// This test exists because the opposite was asserted — in a code comment, in
// the plan and in the spec — on a misreading of that spread order, and only a
// source-level review caught it. tsc cannot: `Slot` is typed
// ComponentDataOptionalId[], so `id` is legal there, just wrong.
describe('preset defaultProps', () => {
  // biome-ignore lint/suspicious/noExplicitAny: walks arbitrary defaultProps shapes looking for a single key.
  function idsAtAnyDepth(value: any, out: string[] = []): string[] {
    if (Array.isArray(value)) {
      for (const v of value) idsAtAnyDepth(v, out);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (k === 'id' && typeof v === 'string') out.push(v);
        idsAtAnyDepth(v, out);
      }
    }
    return out;
  }

  it('pre-seeds no ids, so inserting the same preset twice cannot collide', () => {
    for (const name of ['Container', 'EntryCard', 'BadgeRow', 'MediaGrid']) {
      const component = puckConfig.components[name as 'Container'];
      const children = component?.defaultProps?.children ?? [];
      expect(idsAtAnyDepth(children), `${name} pre-seeds an id`).toEqual([]);
    }
  });
});
