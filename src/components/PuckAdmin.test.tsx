import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/admin/actions', () => ({ saveTabBlocksAction: vi.fn() }));

// The real @puckeditor/core is still loaded below (see the mock factory), and
// it pulls in @dnd-kit/dom, which touches ResizeObserver at import time. jsdom
// has no implementation. Hoisted so it lands before any import runs.
vi.hoisted(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??=
    ResizeObserverStub as unknown as typeof ResizeObserver;
});

// Only <Puck> is replaced. `headerActions` renders Puck's own <Button>, and
// puck.config.tsx imports from this package too, so a wholesale mock would
// break both.
const renders: { plugins: unknown; overrides: unknown }[] = [];
let capturedOnChange: ((data: unknown) => void) | undefined;

vi.mock('@puckeditor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@puckeditor/core')>();
  return {
    ...actual,
    Puck: (props: {
      plugins: unknown;
      overrides: unknown;
      onChange: (data: unknown) => void;
    }) => {
      renders.push({ plugins: props.plugins, overrides: props.overrides });
      capturedOnChange = props.onChange;
      return <div data-testid="puck" />;
    },
  };
});

import type { PortfolioData } from '../types';
import { PuckAdmin } from './PuckAdmin';

const initialData: PortfolioData = {
  version: 2,
  hero: {
    name: 'Truong Nam Nguyen',
    initials: 'TN',
    role: 'Lecturer',
    profile: 'Profile.',
  },
  tabs: [{ id: 'teaching', label: 'Teaching', blocks: [] }],
  footer: '© 2026',
};

describe('PuckAdmin', () => {
  beforeEach(() => {
    renders.length = 0;
    capturedOnChange = undefined;
  });

  // Regression guards for the whole-canvas flash on every keystroke. Puck
  // memoizes its merged overrides on `[plugins, overrides]` and then reads
  // `overrides.preview` as a component type — so a fresh array or object
  // identity here re-mints that component, and React unmounts and remounts the
  // entire preview subtree (iframe included). Both props must stay stable, and
  // each is checked on its own: keeping only one stable still busts the memo,
  // and a single combined assertion wouldn't say which half regressed.
  function renderThenEdit() {
    render(<PuckAdmin initialData={initialData} />);
    expect(renders).toHaveLength(1);
    // What a keystroke does: Puck reports new editor data, which lands in the
    // parent's draft state and re-renders <Puck>.
    act(() => {
      capturedOnChange?.({ root: { props: {} }, content: [], zones: {} });
    });
    expect(renders.length).toBeGreaterThan(1);
    return renders;
  }

  it('keeps `plugins` referentially stable across an edit', () => {
    const [first, ...rest] = renderThenEdit();
    for (const later of rest) {
      expect(later.plugins).toBe(first?.plugins);
    }
  });

  it('keeps `overrides` referentially stable across an edit', () => {
    const [first, ...rest] = renderThenEdit();
    for (const later of rest) {
      expect(later.overrides).toBe(first?.overrides);
    }
  });
});
