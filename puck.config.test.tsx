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
  // The public page renders a container's blocks as DIRECT children of the
  // element carrying the layout classes, so flex-direction acts on them. In
  // the editor Puck interposes its drop-zone element between the two, so
  // wrapping the slot in our own <Container> leaves the flex container with
  // exactly one child — the drop zone — and every block inside it stacks
  // vertically no matter what `direction` is set to. The layout classes have
  // to go ON the drop zone.
  it('puts the layout classes on the element that directly holds the blocks', () => {
    const renderContainer = puckConfig.components.Container
      .render as unknown as AnyRender;

    const { container } = render(
      renderContainer({ ...LAYOUT, children: Slot }),
    );
    const zone = screen.getByTestId('zone');

    expect(zone.className).toContain('layout');
    expect(zone.className).toContain('layout-dir-row');
    expect(zone.className).toContain('layout-gap-sm');
    expect(zone.className).toContain('layout-surface-card');
    expect(zone.className).toContain('layout-wrap');
    // No wrapper between the styled element and the blocks.
    expect(container.firstElementChild).toBe(zone);
    expect(zone.firstElementChild?.tagName).toBe('SPAN');
  });
});
