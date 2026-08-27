// src/lib/puckAdapter.ts
//
// Converts between this app's own Block[] content model (src/types.ts) and
// Puck's Data format (what <Puck> takes as its `data` prop, and what it
// hands back on save). Task 17 wires this into the actual editor UI.
//
// blocksToPuckData's return type is parametrized as Data<PuckComponentProps>
// rather than the bare (generic-default) `Data` — this is deliberate, not
// cosmetic. `PuckComponentProps` is a hand-kept mirror of puck.config.tsx's
// `Props` type (Task 15), used only to make TypeScript actually check the
// shape this function produces. With the bare `Data` type, `content[]`'s
// element type resolves through `DefaultComponents = Record<string, any>`,
// which makes each component's `props` type collapse to `any` (TS collapses
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

type BulletItem = { text: string };

// Mirrors puck.config.tsx's `Props` type. Kept as a separate, hand-written
// copy on purpose — see the file-level comment above and the Task 16 report
// for why this module doesn't import puck.config.tsx itself. tsc cannot
// detect drift between this copy and the real one; keep them in sync by
// hand if puck.config.tsx's fields change.
type PuckComponentProps = {
  Job: { company: string; dates: string; role: string; bullets: BulletItem[] };
  Placeholder: { company: string; note: string };
  Education: {
    school: string;
    dates: string;
    degree: string;
    bullets: BulletItem[];
    dissertation: string;
  };
  CertificateGroup: {
    heading: string;
    certificates: { text: string; accent: boolean }[];
  };
  GalleryItem: { itemType: 'photo' | 'video'; image: string; videoUrl: string };
  Note: { text: string };
};

// The six Puck component names, matched by name against Block['type'].
// Job -> 'Job'/'job' and Note -> 'Note'/'note' are plain lowercasing, but
// CertificateGroup -> 'certificate-group' and GalleryItem -> 'gallery-item'
// are NOT (Block['type'] is kebab-case for multi-word variants; the Puck
// component names in puck.config.tsx are PascalCase). Every branch below
// spells out its own pair explicitly for this reason — nothing here is
// derived by an automatic case transform.
type PuckComponentData = ComponentDataMap<PuckComponentProps>;

const toPuckBullets = (bullets: string[] = []): BulletItem[] =>
  bullets.map((text) => ({ text }));
const fromPuckBullets = (items: { text: string }[] = []): string[] =>
  items.map((i) => i.text);

function blockToComponentData(block: Block, id: string): PuckComponentData {
  switch (block.type) {
    case 'job':
      return {
        type: 'Job',
        props: {
          id,
          company: block.company,
          dates: block.dates,
          role: block.role ?? '',
          bullets: toPuckBullets(block.bullets),
        },
      };
    case 'placeholder':
      return {
        type: 'Placeholder',
        props: { id, company: block.company, note: block.note },
      };
    case 'education':
      return {
        type: 'Education',
        props: {
          id,
          school: block.school,
          dates: block.dates,
          degree: block.degree,
          bullets: toPuckBullets(block.bullets),
          dissertation: block.dissertation ?? '',
        },
      };
    case 'certificate-group':
      return {
        type: 'CertificateGroup',
        props: {
          id,
          heading: block.heading,
          // Certificate.accent is optional in src/types.ts; puck.config.tsx's
          // radio field requires a concrete boolean. Same normalization
          // pattern as Job.role/Education.dissertation above: an absent
          // `accent` becomes explicit `false` the first time a block passes
          // through Puck. See the Task 16 report.
          certificates: block.certificates.map((c) => ({
            text: c.text,
            accent: c.accent ?? false,
          })),
        },
      };
    case 'gallery-item':
      return {
        type: 'GalleryItem',
        props: {
          id,
          itemType: block.itemType,
          image: block.image ?? '',
          videoUrl: block.videoUrl ?? '',
        },
      };
    case 'note':
      return { type: 'Note', props: { id, text: block.text } };
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function blocksToPuckData(blocks: Block[]): Data<PuckComponentProps> {
  return {
    content: blocks.map((block, i) =>
      blockToComponentData(block, `${block.type}-${i}`),
    ),
    root: {},
  };
}

export function puckDataToBlocks(data: Data): Block[] {
  return (data.content as ComponentData[]).map((item): Block => {
    // biome-ignore lint/suspicious/noExplicitAny: Puck's own ComponentData/ComponentDataMap types don't narrow props here; the switch below does the real narrowing to Block shapes per block type.
    const props = item.props as Record<string, any>;
    switch (item.type) {
      case 'Job':
        return {
          type: 'job',
          company: props.company,
          dates: props.dates,
          role: props.role || undefined,
          bullets: fromPuckBullets(props.bullets),
        };
      case 'Placeholder':
        return {
          type: 'placeholder',
          company: props.company,
          note: props.note,
        };
      case 'Education':
        return {
          type: 'education',
          school: props.school,
          dates: props.dates,
          degree: props.degree,
          bullets: fromPuckBullets(props.bullets),
          dissertation: props.dissertation || undefined,
        };
      case 'CertificateGroup':
        return {
          type: 'certificate-group',
          heading: props.heading,
          certificates: props.certificates,
        };
      case 'GalleryItem':
        return {
          type: 'gallery-item',
          itemType: props.itemType,
          image: props.image || undefined,
          videoUrl: props.videoUrl || undefined,
        };
      case 'Note':
        return { type: 'note', text: props.text };
      default:
        throw new Error(`Unknown Puck component type: ${item.type}`);
    }
  });
}
