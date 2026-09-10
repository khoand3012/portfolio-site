'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHEVRON_LEFT_ICON, CHEVRON_RIGHT_ICON } from './icons';

interface StripTab {
  slug: string;
  label: string;
}

interface Props {
  tabs: StripTab[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}

/**
 * How much of the visible width one arrow click travels. Short of a full page
 * on purpose: the sliver of overlap keeps a tab from the previous view on
 * screen, so you can see where you came from.
 */
const SCROLL_FRACTION = 0.8;

/**
 * Fractional layout values (a non-100% browser zoom, a fractional-width
 * container) leave scrollLeft a hair short of its true maximum, and comparing
 * exactly would strand a dead arrow on screen forever. A pixel of slack is
 * below the threshold of a visible clipped tab.
 */
const EDGE_TOLERANCE = 1;

/**
 * The tab bar for the public page: a horizontal scroller with arrows that
 * appear only when there is something to scroll to.
 *
 * The scroller hides its scrollbar (see `.tab-strip` in global.css), which is
 * what made overflow invisible in the first place — tabs past the right edge
 * were reachable only by guessing they were there. The arrows are that missing
 * affordance, so they are driven by measured overflow rather than a tab count:
 * how many tabs fit depends on their labels and the viewport, not their number.
 */
export function TabStrip({ tabs, activeSlug, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // `overflows` gates whether the arrows exist at all; the two `canScroll`
  // flags gate whether each is visible. Kept apart because they answer
  // different questions — see the render below.
  const [overflows, setOverflows] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflows(max > EDGE_TOLERANCE);
    setCanScrollLeft(el.scrollLeft > EDGE_TOLERANCE);
    setCanScrollRight(el.scrollLeft < max - EDGE_TOLERANCE);
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    // ResizeObserver catches a window resize, a zoom change, and a late web
    // font swapping in and re-flowing the labels — none of which fire a
    // scroll event. Guarded because jsdom has no implementation.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // Deliberately not keyed on `tabs`: it is server-rendered content that
    // never changes client-side here, and the ResizeObserver watches the
    // scroller's box, not its contents. Anything that makes the tab list
    // dynamic needs to add it back — a changed list changes the content width
    // without necessarily resizing the scroller, which would strand the
    // arrows in a stale state.
  }, [measure]);

  function scroll(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.round(el.clientWidth * SCROLL_FRACTION),
      behavior: 'smooth',
    });
  }

  return (
    <nav className="tabs">
      <div className="wrap">
        {/* Both arrows render, or neither does. Keeping the exhausted one in
            flow (hidden, not removed) is what stops the strip from changing
            width mid-scroll and shoving the tabs sideways under the cursor,
            and the `visibility: hidden` behind `[data-inert]` is what keeps
            it off-limits to the keyboard — see the rule in global.css. */}
        {overflows && (
          <button
            type="button"
            className="tab-scroll"
            // Icon-only, so it carries its own accessible name — the glyph is
            // aria-hidden, matching every other icon button here.
            aria-label="Scroll tabs left"
            // An attribute for CSS to key off, not `hidden` or `disabled`:
            // `hidden` is `display: none`, which would pull the slot out of
            // flow and bring back the very reflow this avoids, and a disabled
            // button is still announced as a control that exists.
            data-inert={!canScrollLeft || undefined}
            onClick={() => scroll(-1)}
          >
            {CHEVRON_LEFT_ICON}
          </button>
        )}
        <div className="tab-strip" ref={scrollerRef} onScroll={measure}>
          {tabs.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              className={`tab-btn${tab.slug === activeSlug ? ' active' : ''}`}
              onClick={() => onSelect(tab.slug)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {overflows && (
          <button
            type="button"
            className="tab-scroll"
            aria-label="Scroll tabs right"
            data-inert={!canScrollRight || undefined}
            onClick={() => scroll(1)}
          >
            {CHEVRON_RIGHT_ICON}
          </button>
        )}
      </div>
    </nav>
  );
}
