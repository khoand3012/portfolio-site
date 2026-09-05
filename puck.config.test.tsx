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
