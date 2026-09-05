import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { hasUnpublishedEdits } from './draftState';
import { blocksToPuckData } from './puckAdapter';

const published: Block[] = [
  {
    type: 'container',
    children: [{ type: 'heading', text: 'Acme', level: 'h3' }],
    direction: 'stack',
    gap: 'sm',
    padding: 'lg',
    marginBottom: 'lg',
    align: 'stretch',
    justify: 'start',
    columns: 'auto',
    wrap: false,
    surface: 'card',
  },
];

describe('hasUnpublishedEdits', () => {
  it('is false when the editor still holds exactly what was published', () => {
    expect(hasUnpublishedEdits(blocksToPuckData(published), published)).toBe(
      false,
    );
  });

  it('is true once a value has been edited', () => {
    const edited: Block[] = [
      {
        ...(published[0] as Extract<Block, { type: 'container' }>),
        children: [{ type: 'heading', text: 'Acme Corp', level: 'h3' }],
      },
    ];
    expect(hasUnpublishedEdits(blocksToPuckData(edited), published)).toBe(true);
  });

  it('is true when a block has been added', () => {
    const withExtra: Block[] = [
      ...published,
      { type: 'badge', text: 'New badge' },
    ];
    expect(hasUnpublishedEdits(blocksToPuckData(withExtra), published)).toBe(
      true,
    );
  });

  // Puck mints fresh component ids on insert and remount. Those must not read
  // as an edit, or every tab would look dirty the moment it was opened and the
  // unsaved-changes warning would cry wolf.
  it('ignores component ids, which Puck regenerates', () => {
    const data = blocksToPuckData(published);
    const reIded = {
      ...data,
      content: data.content.map((item) => ({
        ...item,
        props: { ...item.props, id: `${item.props.id}-regenerated` },
      })),
    };
    expect(hasUnpublishedEdits(reIded, published)).toBe(false);
  });

  it('treats data it cannot convert as changed rather than clean', () => {
    // Claiming "no changes" for data we failed to read would silently drop
    // the owner's work on a tab switch. Fail toward keeping the draft.
    const broken = { content: [{ type: 'NotAComponent', props: { id: 'x' } }] };
    expect(hasUnpublishedEdits(broken as never, published)).toBe(true);
  });
});
