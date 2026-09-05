// puck.config.tsx
//
// Maps this app's existing block components (src/components/) to Puck's
// editable-component config. Puck is used only as an editing surface here —
// the app keeps its own Block[] content model (src/types.ts) as the stored
// format; Task 16's adapter converts between the two. See Task 15's report
// for the full rationale.
//
// Field-level and component-level `ai` keys: Task 15 left these out because
// the installed @puckeditor/core@0.23.0 alone doesn't declare an `ai` member
// on BaseField/ComponentConfigExtensions. Task 18 installed
// @puckeditor/plugin-ai, which augments those interfaces via declaration
// merging (see its dist/index.d.ts: `declare module "@puckeditor/core"`),
// so `ai.instructions` below is real, checked config. Each instruction is a
// content-fidelity guardrail: Puck AI may scaffold new blocks/bullets/
// certificates but must never rewrite the real CV content already there —
// see this project's CLAUDE.md on content fidelity and the Puck AI handler's
// `ai.context` in app/api/puck/[...all]/route.ts for the other half of this
// guardrail.
import type { Config } from '@puckeditor/core';
import type { ComponentType } from 'react';
import { Badge } from './src/components/Badge';
import { Bullets } from './src/components/Bullets';
import { containerClassName } from './src/components/Container';
import { Dates } from './src/components/Dates';
import { Heading } from './src/components/Heading';
import { Image } from './src/components/Image';
import { Text } from './src/components/Text';
import { Video } from './src/components/Video';
import {
  LAYOUT_ALIGN_OPTIONS,
  LAYOUT_COLUMN_OPTIONS,
  LAYOUT_DIRECTION_OPTIONS,
  LAYOUT_JUSTIFY_OPTIONS,
  LAYOUT_SPACING_OPTIONS,
  LAYOUT_SURFACE_OPTIONS,
  VIDEO_MODE_OPTIONS,
} from './src/lib/layoutOptions';
import type { ContainerProps, PuckComponentProps } from './src/lib/puckTypes';

// Inline-only marks for a bullet item: no block structure inside an <li>.
// textAlign is off deliberately — the container has no text-align option,
// so offering it here would produce markup the sanitizer strips.
const INLINE_RICHTEXT = {
  blockquote: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  listItem: false,
  orderedList: false,
  strike: false,
  textAlign: false,
} as const;

const bulletsField = {
  type: 'array' as const,
  arrayFields: {
    text: { type: 'richtext' as const, options: INLINE_RICHTEXT },
  },
  defaultItemProps: { text: '' },
  getItemSummary: (item: { text: string }) =>
    item.text.replace(/<[^>]*>/g, '') || 'Bullet',
  ai: {
    instructions:
      'Only add new bullets. Never edit or rewrite the text of an existing bullet.',
  },
};

const layoutFields = {
  children: { type: 'slot' as const },
  direction: { type: 'select' as const, options: LAYOUT_DIRECTION_OPTIONS },
  gap: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  padding: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  marginBottom: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  align: { type: 'select' as const, options: LAYOUT_ALIGN_OPTIONS },
  justify: { type: 'select' as const, options: LAYOUT_JUSTIFY_OPTIONS },
  columns: { type: 'select' as const, options: LAYOUT_COLUMN_OPTIONS },
  wrap: {
    type: 'radio' as const,
    options: [
      { label: 'Wrap', value: true },
      { label: 'No wrap', value: false },
    ],
  },
  surface: { type: 'select' as const, options: LAYOUT_SURFACE_OPTIONS },
};

const BASE_LAYOUT: Omit<ContainerProps, 'children'> = {
  direction: 'stack',
  gap: 'sm',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
};

// Renders the slot AS the layout element rather than wrapping it in a
// <Container>. Puck renders a slot as its own drop-zone element and makes the
// blocks that element's children, so wrapping left our flex container with
// exactly one child — the drop zone — and `direction: row` had nothing to act
// on: every container looked vertical in the editor while rendering correctly
// on the public page. Puck forwards `className` onto the drop-zone element
// itself (DropZoneEdit in @puckeditor/core), and its own drop-zone rule sets
// no `display`, so the layout classes compose with it cleanly.
const renderContainer = ({
  children: Children,
  ...layout
}: {
  children: ComponentType<{ className?: string }>;
} & Omit<ContainerProps, 'children'>) => (
  <Children className={containerClassName(layout)} />
);

export const puckConfig: Config<PuckComponentProps> = {
  components: {
    Container: {
      fields: layoutFields,
      defaultProps: { ...BASE_LAYOUT, children: [] },
      render: renderContainer,
    },
    // EntryCard/BadgeRow/MediaGrid differ from Container ONLY in
    // defaultProps. They are insert-time scaffolding: puckDataToBlocks
    // collapses all four to { type: 'container' }, so an EntryCard reopens
    // as a Container — lossless in content, mildly lossy in labelling.
    //
    // The pre-seeded children below carry NO `id`, and must not. Puck's
    // insertAction calls populateIds(data, config) with two arguments, so
    // its `override` parameter defaults to false — and in that branch the
    // child mapper is `{ ...{ id: generated }, ...item.props }`, spreading
    // the item's own props LAST. An `id` written here would therefore win
    // over the generated one and survive verbatim into every insert, so two
    // EntryCards would share ids for their title row, heading, dates,
    // subtitle and bullets — and Puck keys its node index and its slot zone
    // compounds (`${parentId}:${propName}`) by id, so the second card would
    // alias the first. Omitting `id` is what makes populateIds supply a
    // fresh one; `Slot` is typed ComponentDataOptionalId[], so this
    // type-checks. Verified against the installed @puckeditor/core@0.23.0
    // bundle, not its docs — an earlier comment here asserted the opposite.
    // src/lib/puckAdapter.test.ts guards it.
    EntryCard: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        surface: 'card',
        padding: 'lg',
        marginBottom: 'lg',
        children: [
          {
            type: 'Container',
            props: {
              ...BASE_LAYOUT,
              direction: 'row',
              justify: 'between',
              align: 'baseline',
              wrap: true,
              children: [
                { type: 'Heading', props: { text: '', level: 'h3' } },
                { type: 'Dates', props: { text: '' } },
              ],
            },
          },
          { type: 'Text', props: { html: '', variant: 'subtitle' } },
          { type: 'Bullets', props: { items: [] } },
        ],
      },
      render: renderContainer,
    },
    BadgeRow: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        direction: 'row',
        wrap: true,
        gap: 'sm',
        children: [],
      },
      render: renderContainer,
    },
    MediaGrid: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        direction: 'grid',
        columns: 'auto',
        gap: 'md',
        children: [],
      },
      render: renderContainer,
    },
    Heading: {
      fields: {
        text: {
          type: 'text',
          ai: {
            instructions:
              'A real name — never invent or alter an existing heading.',
          },
        },
        level: {
          type: 'select',
          options: [
            { label: 'H2', value: 'h2' },
            { label: 'H3', value: 'h3' },
            { label: 'H4', value: 'h4' },
          ],
        },
      },
      defaultProps: { text: '', level: 'h3' },
      render: (props) => (
        <Heading
          block={{ type: 'heading', text: props.text, level: props.level }}
        />
      ),
    },
    Text: {
      fields: {
        html: {
          type: 'richtext',
          // Same option set as a bullet item: paragraph plus inline marks.
          // Tiptap always wraps content in a block node, so both fields
          // produce <p>…</p> and both are rendered through the same CSS.
          options: INLINE_RICHTEXT,
          ai: {
            instructions: 'Only add new text. Never rewrite existing text.',
          },
        },
        variant: {
          type: 'select',
          options: [
            { label: 'Body', value: 'body' },
            { label: 'Subtitle', value: 'subtitle' },
            { label: 'Small', value: 'small' },
          ],
        },
      },
      defaultProps: { html: '', variant: 'body' },
      render: (props) => (
        <Text
          block={{ type: 'text', html: props.html, variant: props.variant }}
        />
      ),
    },
    Dates: {
      fields: { text: { type: 'text' } },
      defaultProps: { text: '' },
      render: (props) => <Dates block={{ type: 'dates', text: props.text }} />,
    },
    Bullets: {
      fields: { items: bulletsField },
      defaultProps: { items: [] },
      render: (props) => (
        <Bullets
          block={{ type: 'bullets', items: props.items.map((i) => i.text) }}
        />
      ),
    },
    Badge: {
      fields: {
        text: {
          type: 'text',
          ai: {
            instructions:
              "Only add new badges. Never rewrite an existing badge's text.",
          },
        },
        year: { type: 'text' },
        accent: {
          type: 'radio',
          options: [
            { label: 'Accent', value: true },
            { label: 'Normal', value: false },
          ],
        },
      },
      defaultProps: { text: '', year: '', accent: false },
      render: (props) => (
        <Badge
          block={{
            type: 'badge',
            text: props.text,
            accent: props.accent,
            year: props.year || undefined,
          }}
        />
      ),
    },
    Image: {
      fields: {
        src: { type: 'text' },
        alt: { type: 'text' },
        caption: { type: 'text' },
      },
      defaultProps: { src: '', alt: '', caption: '' },
      render: (props) => (
        <Image
          block={{
            type: 'image',
            src: props.src || undefined,
            alt: props.alt || undefined,
            caption: props.caption || undefined,
          }}
        />
      ),
    },
    Video: {
      fields: {
        mode: { type: 'select', options: VIDEO_MODE_OPTIONS },
        url: { type: 'text' },
        poster: { type: 'text' },
        caption: { type: 'text' },
      },
      defaultProps: { mode: 'link', url: '', poster: '', caption: '' },
      render: (props) => (
        <Video
          block={{
            type: 'video',
            mode: props.mode,
            url: props.url || undefined,
            poster: props.poster || undefined,
            caption: props.caption || undefined,
          }}
        />
      ),
    },
  },
};
