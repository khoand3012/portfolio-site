import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { puckConfig } from './puck.config';

// Puck renders a slot as ONE drop-zone element whose children are the blocks,
// and forwards `className`/`style` onto that element (see DropZoneEdit in
// @puckeditor/core). This stands in for it.
function Slot({ className }: { className?: string }) {
  return (
    <div data-testid="zone" className={className}>
      <span>block</span>
    </div>
  );
}

const LAYOUT = {
  direction: 'row',
  gap: 'sm',
  padding: 'lg',
  marginBottom: 'lg',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: true,
  surface: 'card',
};

type AnyRender = (props: Record<string, unknown>) => ReactElement;

// A block inserted from the Blocks panel arrives with its defaultProps. If
// those are empty strings the block renders as an empty element with no
// content, which collapses to 0px in the editor: invisible, unselectable,
// and impossible to aim a drag at. Every insertable block must render
// something visible before the owner has typed anything.
const LEAF_COMPONENTS = [
  'Heading',
  'Text',
  'Dates',
  'Bullets',
  'Badge',
  'Image',
  'Video',
] as const;

// biome-ignore lint/suspicious/noExplicitAny: reading Puck's config shape generically in a test.
type AnySpec = { type: string; props: any };

// biome-ignore lint/suspicious/noExplicitAny: reading Puck's config shape generically in a test.
function leafSpecs(children: any[]): AnySpec[] {
  return (children ?? []).flatMap((child: AnySpec) =>
    child.type === 'Container' || child.type === 'EntryCard'
      ? leafSpecs(child.props?.children ?? [])
      : [child],
  );
}

// biome-ignore lint/suspicious/noExplicitAny: reading Puck's config shape generically in a test.
const components = puckConfig.components as any;

function renderWith(type: string, props: unknown): string {
  const renderFn = components[type].render as AnyRender;
  const { container } = render(
    renderFn({ ...(props as Record<string, unknown>) }),
  );
  return container.textContent?.trim() ?? '';
}

describe('blocks inserted from the Blocks panel are visible', () => {
  it.each(LEAF_COMPONENTS)(
    '%s renders content from its defaultProps',
    (name) => {
      expect(
        renderWith(name, components[name].defaultProps).length,
      ).toBeGreaterThan(0);
    },
  );

  it('seeds every block in the EntryCard preset with visible content', () => {
    const seeded = leafSpecs(components.EntryCard.defaultProps.children);
    expect(seeded.length).toBeGreaterThan(0);
    for (const spec of seeded) {
      expect(
        renderWith(spec.type, spec.props).length,
        `${spec.type} in the EntryCard preset renders nothing`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("puck.config Container render (the editor's path)", () => {
  // Two constraints pull in opposite directions here.
  //
  // 1. The public page makes a container's blocks DIRECT children of the
  //    element carrying the layout classes, so flex-direction acts on them.
  //    In the editor Puck interposes its drop-zone element, so the flow
  //    classes (direction/gap/align/justify/columns/wrap) must land ON the
  //    drop zone or every container renders vertically whatever `direction`
  //    says.
  // 2. Puck treats the component element and the drop-zone element as
  //    distinct, NESTED nodes — its area/zone depth tracking is what decides
  //    which zone accepts a drop. Collapsing both onto one element makes a
  //    drag into an empty container land in the parent zone instead, so the
  //    block appears below the container rather than inside it.
  //
  // Hence the split: an outer box element keeps the surface/padding/margin
  // and preserves Puck's nesting, and the drop zone carries the flow.
  it('gives the drop zone the flow classes so blocks are direct flex children', () => {
    const renderContainer = puckConfig.components.Container
      .render as unknown as AnyRender;

    render(renderContainer({ ...LAYOUT, children: Slot }));
    const zone = screen.getByTestId('zone');

    expect(zone.className).toContain('layout');
    expect(zone.className).toContain('layout-dir-row');
    expect(zone.className).toContain('layout-gap-sm');
    expect(zone.className).toContain('layout-wrap');
    expect(zone.firstElementChild?.tagName).toBe('SPAN');
  });

  it('keeps the drop zone nested inside a box element, as Puck expects', () => {
    const renderContainer = puckConfig.components.Container
      .render as unknown as AnyRender;

    const { container } = render(
      renderContainer({ ...LAYOUT, children: Slot }),
    );
    const zone = screen.getByTestId('zone');
    const box = container.firstElementChild as HTMLElement;

    // The drop zone must NOT be the component's own root element.
    expect(box).not.toBe(zone);
    expect(box.contains(zone)).toBe(true);
    expect(box.className).toContain('layout-p-lg');
    expect(box.className).toContain('layout-mb-lg');
    expect(box.className).toContain('layout-surface-card');
  });
});

// The hover-scale and click-to-preview behaviour belongs to the public page
// only. The editor gets it by accident the moment puck.config's render starts
// passing an onOpen handler, so pin the absence here rather than trusting the
// two call sites to stay different.
describe('the editor renders media tiles inert', () => {
  it('gives an image tile no lightbox trigger', () => {
    const renderFn = components.Image.render as AnyRender;
    const { container } = render(
      renderFn({
        src: 'https://cdn.example/a.jpg',
        alt: 'A photo',
        caption: '',
      }),
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('gives a video tile no lightbox trigger, and keeps its link navigating', () => {
    const renderFn = components.Video.render as AnyRender;
    const { container } = render(
      renderFn({
        mode: 'link',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        poster: '',
        caption: '',
      }),
    );
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('a')).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  // A link tile keeps its <a> in both paths, so the anchor's own class can't
  // carry the hover scale — the editor would get it too. Only the marker
  // class the public path adds may.
  it('gives a video tile no hover-scale marker class', () => {
    const renderFn = components.Video.render as AnyRender;
    const { container } = render(
      renderFn({
        mode: 'link',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        poster: '',
        caption: '',
      }),
    );
    expect(container.querySelector('.media-link-interactive')).toBeNull();
  });
});

describe('media fields upload as well as accept a pasted URL', () => {
  it.each([
    ['Image', 'src'],
    ['Video', 'url'],
    ['Video', 'poster'],
  ])('%s.%s is an upload-or-paste field', (component, prop) => {
    const fields = components[component].fields as Record<
      string,
      { type: string } | undefined
    >;
    expect(fields[prop]?.type).toBe('custom');
  });

  it('leaves the non-media fields as they were', () => {
    const imageFields = components.Image.fields as Record<
      string,
      { type: string }
    >;
    expect(imageFields.alt?.type).toBe('text');
    expect(imageFields.caption?.type).toBe('text');
    expect(
      (components.Video.fields as Record<string, { type: string }>).mode?.type,
    ).toBe('select');
  });
});

// Puck's custom field can only write its own prop, so the mode toggle is
// reconciled here instead. Only an object key this app generated counts —
// see isUploadedVideoUrl — so a pasted URL is never second-guessed.
describe('uploading a video switches it to embed mode', () => {
  const resolveData = components.Video.resolveData as (
    data: { props: Record<string, unknown> },
    params: {
      changed: Record<string, boolean>;
      lastData?: { props: Record<string, unknown> } | null;
    },
  ) => { props: Record<string, unknown> };

  const UPLOADED =
    'https://pub-abc.r2.dev/media/0f8fad5b-d9cb-469f-a165-70867728950e.mp4';

  it('flips mode to embed for an uploaded file', () => {
    const result = resolveData(
      { props: { mode: 'link', url: UPLOADED } },
      { changed: { url: true } },
    );
    expect(result.props.mode).toBe('embed');
  });

  it('leaves a pasted provider URL as a link', () => {
    const result = resolveData(
      {
        props: {
          mode: 'link',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
      { changed: { url: true } },
    );
    expect(result.props.mode).toBe('link');
  });

  // Otherwise an owner who deliberately set a mode would have it overwritten
  // every time Puck re-resolved the component.
  it('does nothing when the url did not change', () => {
    const result = resolveData(
      { props: { mode: 'link', url: UPLOADED } },
      { changed: { caption: true } },
    );
    expect(result.props.mode).toBe('link');
  });

  // The sequence that matters in practice, and the one a link→embed-only
  // test misses: upload a file (mode flips to embed), then change your mind
  // and paste a YouTube URL over it. Left at embed, that renders a provider
  // PAGE url in a <video> element, which can never play.
  it('flips back to link when an uploaded file is replaced by a pasted URL', () => {
    const result = resolveData(
      {
        props: {
          mode: 'embed',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
      { changed: { url: true }, lastData: { props: { url: UPLOADED } } },
    );
    expect(result.props.mode).toBe('link');
  });

  // Only OUR OWN automatic flip is reversed. An owner who deliberately chose
  // embed for a direct file URL they host elsewhere keeps that choice when
  // they edit the URL.
  it('leaves a deliberate embed choice alone when no upload was involved', () => {
    const result = resolveData(
      { props: { mode: 'embed', url: 'https://cdn.example/new.mp4' } },
      {
        changed: { url: true },
        lastData: { props: { url: 'https://cdn.example/old.mp4' } },
      },
    );
    expect(result.props.mode).toBe('embed');
  });
});
