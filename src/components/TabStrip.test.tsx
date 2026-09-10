import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TabStrip } from './TabStrip';

const tabs = [
  { slug: 'a', label: 'A' },
  { slug: 'b', label: 'B' },
  { slug: 'c', label: 'C' },
];

/**
 * jsdom has no layout engine: every element reports 0 for scrollWidth,
 * clientWidth and scrollLeft, so a real scroller is indistinguishable from a
 * non-scrolling one. These helpers install the measurements a browser would
 * have computed, which is the only way to exercise the overflow states.
 */
function measure(
  el: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft }: Record<string, number>,
) {
  for (const [prop, value] of [
    ['scrollWidth', scrollWidth],
    ['clientWidth', clientWidth],
  ] as const) {
    Object.defineProperty(el, prop, { value, configurable: true });
  }
  // scrollLeft must stay writable: the component reads it after each scroll
  // event, and the tests move it to simulate scrolling.
  Object.defineProperty(el, 'scrollLeft', {
    value: scrollLeft,
    writable: true,
    configurable: true,
  });
  // jsdom implements neither scrollBy nor scrollTo.
  el.scrollBy = vi.fn();
}

function renderStrip() {
  const onSelect = vi.fn();
  const { container } = render(
    <TabStrip tabs={tabs} activeSlug="a" onSelect={onSelect} />,
  );
  const scroller = container.querySelector('.tab-strip') as HTMLElement;
  return { container, scroller, onSelect };
}

/** Fits: no overflow at all. */
function renderFitting() {
  const rendered = renderStrip();
  measure(rendered.scroller, {
    scrollWidth: 300,
    clientWidth: 300,
    scrollLeft: 0,
  });
  fireEvent.scroll(rendered.scroller);
  return rendered;
}

/** Overflows, parked at the far left. */
function renderOverflowing() {
  const rendered = renderStrip();
  measure(rendered.scroller, {
    scrollWidth: 900,
    clientWidth: 300,
    scrollLeft: 0,
  });
  fireEvent.scroll(rendered.scroller);
  return rendered;
}

const prev = () => screen.getByRole('button', { name: 'Scroll tabs left' });
const next = () => screen.getByRole('button', { name: 'Scroll tabs right' });

/**
 * The exhausted arrow is hidden by `.tab-scroll[data-inert]` in global.css,
 * which jsdom never loads, so a computed-visibility assertion would report it
 * visible here no matter what. These assert the attribute the stylesheet keys
 * off instead — the component's actual contract. That the rule then hides it
 * is verified in a browser, not in jsdom.
 */
const expectInert = (el: HTMLElement) =>
  expect(el).toHaveAttribute('data-inert');
const expectLive = (el: HTMLElement) =>
  expect(el).not.toHaveAttribute('data-inert');

describe('TabStrip', () => {
  it('renders every tab, and reports the one clicked', async () => {
    const user = userEvent.setup();
    const { container, onSelect } = renderStrip();

    const labels = within(container)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['A', 'B', 'C']));

    await user.click(screen.getByRole('button', { name: 'B' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  // The common case: few enough tabs to fit. Arrows would be pure noise, so
  // they are absent from the DOM rather than merely hidden.
  it('renders no arrows when the tabs fit', () => {
    renderFitting();
    expect(
      screen.queryByRole('button', { name: 'Scroll tabs left' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Scroll tabs right' }),
    ).toBeNull();
  });

  // Both slots stay in flow once scrolling is possible, so the strip's width
  // never changes mid-scroll and the tabs don't jitter sideways. The
  // exhausted direction is hidden, which also drops it out of the
  // accessibility tree — it reads as absent, not as a dead control.
  it('keeps both arrow slots but hides the left one at the start', () => {
    renderOverflowing();
    expectInert(prev());
    expectLive(next());
  });

  it('shows the left arrow once scrolled away from the start', () => {
    const { scroller } = renderOverflowing();

    scroller.scrollLeft = 200;
    fireEvent.scroll(scroller);

    expectLive(prev());
    expectLive(next());
  });

  it('hides the right arrow at the end of the scroll range', () => {
    const { scroller } = renderOverflowing();

    scroller.scrollLeft = 600; // scrollWidth 900 - clientWidth 300
    fireEvent.scroll(scroller);

    expectLive(prev());
    expectInert(next());
  });

  // Fractional layout values at non-100% browser zoom leave scrollLeft a
  // hair short of the true maximum, which would strand a dead right arrow on
  // screen forever. Anything within a pixel counts as the end.
  it('treats a sub-pixel gap from the end as the end', () => {
    const { scroller } = renderOverflowing();

    scroller.scrollLeft = 599.6;
    fireEvent.scroll(scroller);

    expectInert(next());
  });

  it('scrolls by most of a page, in the arrow’s direction', async () => {
    const user = userEvent.setup();
    const { scroller } = renderOverflowing();

    await user.click(next());
    expect(scroller.scrollBy).toHaveBeenCalledWith({
      left: 240, // 80% of the 300px viewport, leaving a sliver of overlap
      behavior: 'smooth',
    });

    scroller.scrollLeft = 240;
    fireEvent.scroll(scroller);
    await user.click(prev());
    expect(scroller.scrollBy).toHaveBeenLastCalledWith({
      left: -240,
      behavior: 'smooth',
    });
  });
});
