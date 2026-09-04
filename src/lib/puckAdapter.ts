// src/lib/puckAdapter.ts
//
// Converts between this app's own Block[] content model (src/types.ts) and
// Puck's Data format (what <Puck> takes as its `data` prop, and what it
// hands back on save). Task 17 wires this into the actual editor UI.
//
// blocksToPuckData's return type is parametrized as Data<PuckComponentProps>
// rather than the bare (generic-default) `Data` — this is deliberate, not
// cosmetic. `PuckComponentProps` (imported from src/lib/puckTypes.ts, the
// single source of truth shared with puck.config.tsx's `Config<...>`
// parameter) is used only to make TypeScript actually check the shape this
// function produces. With the bare `Data` type, `content[]`'s element type
// resolves through `DefaultComponents = Record<string, any>`, which makes
// each component's `props` type collapse to `any` (TS collapses
// `any & { id: string }` to plain `any`) — so a `props` object *missing*
// `id` type-checks fine against bare `Data`, even though `id` is genuinely
// required by Puck at runtime (see WithId<Props> in
// node_modules/@puckeditor/core/dist/actions-DA1J5F56.d.ts). Parametrizing
// with concrete prop shapes avoids that collapse and makes `npm run check`
// passing mean something for this function specifically. See the Task 16
// report for the tsc experiment that found this.
//
// puckDataToBlocks intentionally keeps the bare `Data` parameter type: it
// receives whatever <Puck>'s onChange/onPublish hands Task 17, typed through
// Puck's own generics, and a narrower invented parameter type here could
// reject a call Task 17's implementer has no reason to expect trouble from.
// A precise *return* type is safe to hand to a wider caller; a precise
// *parameter* type is not safe to demand from one. Runtime shape safety for
// this direction comes from the round-trip test, not from the type checker.
import type { ComponentData, ComponentDataMap, Data } from '@puckeditor/core';
import type { Block } from '../types';
import type { PuckComponentProps } from './puckTypes';

type PuckComponentData = ComponentDataMap<PuckComponentProps>;

// Runtime mirror of `keyof PuckComponentProps`, exported so
// puckAdapter.test.ts can assert this module recognizes exactly the
// component names actually configured in puck.config.tsx (no more, no
// less), without needing to export any of the switch-statement internals
// above. Typed as Record<keyof PuckComponentProps, true> rather than a bare
// string array so that TypeScript's excess/missing-property checking on
// this object literal itself forces this list to stay in sync with
// PuckComponentProps — adding, removing, or renaming a key in the shared
// type and forgetting to update this list is a compile error, not a
// silent runtime drift.
const KNOWN_COMPONENT_TYPES: Record<keyof PuckComponentProps, true> = {
  Container: true,
  EntryCard: true,
  BadgeRow: true,
  MediaGrid: true,
  Heading: true,
  Text: true,
  Dates: true,
  Bullets: true,
  Badge: true,
  Image: true,
  Video: true,
};
export const KNOWN_COMPONENT_NAMES = Object.keys(
  KNOWN_COMPONENT_TYPES,
) as (keyof PuckComponentProps)[];

function blockToComponentData(block: Block, id: string): PuckComponentData {
  switch (block.type) {
    case 'container':
      return {
        type: 'Container',
        props: {
          id,
          direction: block.direction,
          gap: block.gap,
          padding: block.padding,
          marginBottom: block.marginBottom,
          align: block.align,
          justify: block.justify,
          columns: block.columns,
          wrap: block.wrap,
          // Slot content lives inline under props, in the same
          // Content<Components> shape as top-level data.content — so one
          // recursive pair of functions handles every depth.
          children: block.children.map((child, i) =>
            blockToComponentData(child, `${id}-${child.type}-${i}`),
          ),
          surface: block.surface,
        },
      };
    case 'heading':
      return {
        type: 'Heading',
        props: { id, text: block.text, level: block.level },
      };
    case 'text':
      return {
        type: 'Text',
        props: { id, html: block.html, variant: block.variant },
      };
    case 'dates':
      return { type: 'Dates', props: { id, text: block.text } };
    case 'bullets':
      return {
        type: 'Bullets',
        props: { id, items: block.items.map((text) => ({ text })) },
      };
    case 'badge':
      return {
        type: 'Badge',
        props: {
          id,
          text: block.text,
          accent: block.accent ?? false,
          year: block.year ?? '',
        },
      };
    case 'image':
      return {
        type: 'Image',
        props: {
          id,
          src: block.src ?? '',
          alt: block.alt ?? '',
          caption: block.caption ?? '',
        },
      };
    case 'video':
      return {
        type: 'Video',
        props: {
          id,
          mode: block.mode,
          url: block.url ?? '',
          poster: block.poster ?? '',
          caption: block.caption ?? '',
        },
      };
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function blocksToPuckData(blocks: Block[]): Data<PuckComponentProps> {
  return {
    // Path-based ids. Puck requires ids unique across the WHOLE tree for
    // selection and drag-and-drop; the old `${type}-${i}` scheme is only
    // unique within one flat list, so a top-level container and a child
    // container would both be "container-0".
    content: blocks.map((block, i) =>
      blockToComponentData(block, `${block.type}-${i}`),
    ),
    root: {},
  };
}

export function puckDataToBlocks(data: Data): Block[] {
  // Puck's Data carries an optional legacy `zones` map, and migrate() exists
  // to fold those into slot props. This config uses slots exclusively and
  // never DropZone, so Puck will not emit zones — but silently ignoring a
  // populated one would drop nested content, which is exactly the
  // content-loss failure this repo exists to prevent.
  if (data.zones && Object.keys(data.zones).length > 0) {
    throw new Error(
      'Unexpected legacy `zones` in Puck data — this config uses slots only. Refusing to save rather than risk dropping nested content.',
    );
  }
  return contentToBlocks(data.content as ComponentData[]);
}

function contentToBlocks(content: ComponentData[]): Block[] {
  return content.map((item): Block => {
    // biome-ignore lint/suspicious/noExplicitAny: Puck's ComponentData types don't narrow props here; the switch below does the real narrowing to Block shapes.
    const props = item.props as Record<string, any>;
    switch (item.type) {
      // All four container-shaped components collapse to one stored type.
      // Presets are insert-time scaffolding, not a persisted distinction.
      case 'Container':
      case 'EntryCard':
      case 'BadgeRow':
      case 'MediaGrid':
        return {
          type: 'container',
          children: contentToBlocks((props.children ?? []) as ComponentData[]),
          direction: props.direction,
          gap: props.gap,
          padding: props.padding,
          marginBottom: props.marginBottom,
          align: props.align,
          justify: props.justify,
          columns: props.columns,
          wrap: props.wrap,
          surface: props.surface,
        };
      case 'Heading':
        return { type: 'heading', text: props.text, level: props.level };
      case 'Text':
        return { type: 'text', html: props.html, variant: props.variant };
      case 'Dates':
        return { type: 'dates', text: props.text };
      case 'Bullets':
        return {
          type: 'bullets',
          items: (props.items ?? []).map((i: { text: string }) => i.text),
        };
      case 'Badge':
        return {
          type: 'badge',
          text: props.text,
          accent: props.accent,
          year: props.year || undefined,
        };
      case 'Image':
        return {
          type: 'image',
          src: props.src || undefined,
          alt: props.alt || undefined,
          caption: props.caption || undefined,
        };
      case 'Video':
        return {
          type: 'video',
          mode: props.mode,
          url: props.url || undefined,
          poster: props.poster || undefined,
          caption: props.caption || undefined,
        };
      default:
        throw new Error(`Unknown Puck component type: ${item.type}`);
    }
  });
}
