import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioData } from '../../src/types';

vi.mock('../../auth', () => ({ auth: vi.fn() }));
vi.mock('../../src/lib/portfolioContent', () => ({
  readPortfolioContentWithEtag: vi.fn(),
  savePortfolioContent: vi.fn(),
}));

import { auth } from '../../auth';
import { SaveConflictError } from '../../src/lib/blobStore';
import {
  readPortfolioContentWithEtag,
  savePortfolioContent,
} from '../../src/lib/portfolioContent';
import { saveTabBlocksAction, saveTabsAction } from './actions';

const ALLOWED_EMAIL = 'owner@example.com';

function fixtureContent(): PortfolioData {
  return {
    version: 2,
    hero: { name: 'Test', initials: 'T', role: 'Role', profile: 'Profile' },
    tabs: [
      { id: 'teaching', label: 'Teaching', blocks: [] },
      { id: 'media', label: 'Media', blocks: [] },
    ],
    footer: 'Footer',
  };
}

const container = (over: Record<string, unknown> = {}) => ({
  type: 'container',
  children: [],
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
  ...over,
});

describe('saveTabBlocksAction', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: ALLOWED_EMAIL },
      expires: '',
    } as never);
    process.env.ALLOWED_EMAILS = ALLOWED_EMAIL;
    vi.mocked(readPortfolioContentWithEtag).mockResolvedValue({
      data: fixtureContent(),
      etag: 'etag-1',
    });
    vi.mocked(savePortfolioContent).mockResolvedValue(undefined);
  });

  it('rejects a session email not on the allow-list', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'stranger@example.com' },
      expires: '',
    } as never);
    await expect(saveTabBlocksAction('teaching', [])).rejects.toThrow(
      'Not authorized.',
    );
  });

  it('rejects a tree nested past the depth cap', async () => {
    let deep = container();
    for (let i = 0; i < 8; i += 1) deep = container({ children: [deep] });
    await expect(
      saveTabBlocksAction('teaching', [deep] as never),
    ).rejects.toThrow(/nests deeper/);
  });

  it('rejects a tree over the node cap', async () => {
    const many = Array.from({ length: 2001 }, () => container());
    await expect(
      saveTabBlocksAction('teaching', many as never),
    ).rejects.toThrow(/more than 2000/);
  });

  it('rejects a rich-text value over the length cap', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        { type: 'text', html: 'x'.repeat(20_001), variant: 'body' },
      ] as never),
    ).rejects.toThrow(/exceeds 20000/);
  });

  it('rejects a layout value outside the allow-list', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        container({ direction: 'flex' }),
      ] as never),
    ).rejects.toThrow(/unknown direction/);
  });

  it('rejects an unknown video mode', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        { type: 'video', mode: 'autoplay' },
      ] as never),
    ).rejects.toThrow(/unknown mode/);
  });

  it('rejects a tab id that no longer exists, distinctly from a conflict', async () => {
    await expect(saveTabBlocksAction('deleted-tab', [])).rejects.toThrow(
      /no longer exists/,
    );
  });

  it('strips disallowed markup instead of failing the save', async () => {
    await saveTabBlocksAction('teaching', [
      {
        type: 'text',
        html: '<p>ok<script>bad()</script></p>',
        variant: 'body',
      },
    ] as never);
    const saved = vi.mocked(savePortfolioContent).mock
      .calls[0]?.[0] as PortfolioData;
    expect(JSON.stringify(saved)).not.toContain('script');
    expect(JSON.stringify(saved)).toContain('ok');
  });

  it('accepts a valid nested tree', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        container({
          surface: 'card',
          children: [{ type: 'heading', text: 'Acme', level: 'h3' }],
        }),
      ] as never),
    ).resolves.toBeUndefined();
  });

  it('surfaces a clear conflict message when the store detects a concurrent save', async () => {
    vi.mocked(savePortfolioContent).mockRejectedValue(
      new SaveConflictError('current.json'),
    );
    await expect(saveTabBlocksAction('teaching', [])).rejects.toThrow(
      'Someone else saved changes to this tab while you were editing.',
    );
  });

  it('propagates a non-conflict save error unchanged', async () => {
    vi.mocked(savePortfolioContent).mockRejectedValue(
      new Error('store is down'),
    );
    await expect(saveTabBlocksAction('teaching', [])).rejects.toThrow(
      'store is down',
    );
  });
});

describe('saveTabsAction', () => {
  beforeEach(() => {
    // Call counts accumulate across the file otherwise, and several of
    // these tests assert the store was never touched.
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { email: ALLOWED_EMAIL },
      expires: '',
    } as never);
    process.env.ALLOWED_EMAILS = ALLOWED_EMAIL;
    vi.mocked(readPortfolioContentWithEtag).mockResolvedValue({
      data: withBlocks(),
      etag: 'etag-1',
    });
    vi.mocked(savePortfolioContent).mockResolvedValue(undefined);
  });

  // A tab whose blocks must survive a rename or reorder — the whole risk of
  // an action that rewrites the tab list is that it drops the content
  // hanging off it.
  function withBlocks(): PortfolioData {
    const data = fixtureContent();
    return {
      ...data,
      tabs: data.tabs.map((tab, i) =>
        i === 0
          ? {
              ...tab,
              blocks: [{ type: 'heading', text: 'Kept', level: 'h3' }],
            }
          : tab,
      ),
    };
  }

  function savedDoc(): PortfolioData {
    return vi.mocked(savePortfolioContent).mock.calls[0]?.[0] as PortfolioData;
  }

  it('rejects a session email not on the allow-list', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { email: 'stranger@example.com' },
      expires: '',
    } as never);
    await expect(
      saveTabsAction([{ id: 'teaching', label: 'T' }]),
    ).rejects.toThrow('Not authorized.');
    expect(readPortfolioContentWithEtag).not.toHaveBeenCalled();
    expect(savePortfolioContent).not.toHaveBeenCalled();
  });

  it('renames a tab without touching its blocks', async () => {
    await saveTabsAction([
      { id: 'teaching', label: 'Teaching & Training' },
      { id: 'media', label: 'Media' },
    ]);
    const tabs = savedDoc().tabs;
    expect(tabs[0]?.label).toBe('Teaching & Training');
    expect(tabs[0]?.blocks).toEqual([
      { type: 'heading', text: 'Kept', level: 'h3' },
    ]);
  });

  it('reorders tabs, carrying their blocks with them', async () => {
    await saveTabsAction([
      { id: 'media', label: 'Media' },
      { id: 'teaching', label: 'Teaching' },
    ]);
    const tabs = savedDoc().tabs;
    expect(tabs.map((t) => t.id)).toEqual(['media', 'teaching']);
    expect(tabs[1]?.blocks).toHaveLength(1);
  });

  it('adds a tab with an empty block list for an unknown id', async () => {
    await saveTabsAction([
      { id: 'teaching', label: 'Teaching' },
      { id: 'media', label: 'Media' },
      { id: 'brand-new-uuid', label: 'Awards' },
    ]);
    const tabs = savedDoc().tabs;
    expect(tabs).toHaveLength(3);
    expect(tabs[2]).toEqual({
      id: 'brand-new-uuid',
      label: 'Awards',
      blocks: [],
    });
  });

  it('deletes a tab omitted from the list, blocks and all', async () => {
    await saveTabsAction([{ id: 'media', label: 'Media' }]);
    const tabs = savedDoc().tabs;
    expect(tabs.map((t) => t.id)).toEqual(['media']);
  });

  it('leaves hero and footer untouched', async () => {
    await saveTabsAction([{ id: 'media', label: 'Media' }]);
    const doc = savedDoc();
    expect(doc.hero).toEqual(fixtureContent().hero);
    expect(doc.footer).toBe('Footer');
    expect(doc.version).toBe(2);
  });

  it('rejects duplicate ids', async () => {
    await expect(
      saveTabsAction([
        { id: 'teaching', label: 'One' },
        { id: 'teaching', label: 'Two' },
      ]),
    ).rejects.toThrow(/duplicate/i);
    expect(savePortfolioContent).not.toHaveBeenCalled();
  });

  it('rejects an empty or whitespace-only label', async () => {
    await expect(
      saveTabsAction([{ id: 'teaching', label: '   ' }]),
    ).rejects.toThrow(/label/i);
    expect(savePortfolioContent).not.toHaveBeenCalled();
  });

  it('rejects more tabs than the cap allows', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      id: `t${i}`,
      label: `Tab ${i}`,
    }));
    await expect(saveTabsAction(many)).rejects.toThrow(/20/);
    expect(savePortfolioContent).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload', async () => {
    await expect(saveTabsAction('nope' as never)).rejects.toThrow(
      /not an array/i,
    );
  });

  it('surfaces a clear conflict message when the store detects a concurrent save', async () => {
    vi.mocked(savePortfolioContent).mockRejectedValue(
      new SaveConflictError('stale etag'),
    );
    await expect(
      saveTabsAction([{ id: 'teaching', label: 'Teaching' }]),
    ).rejects.toThrow(/Someone else saved changes/);
  });

  it('writes with the etag it read, so a concurrent save is detected', async () => {
    await saveTabsAction([{ id: 'teaching', label: 'Teaching' }]);
    expect(savePortfolioContent).toHaveBeenCalledWith(expect.anything(), {
      ifMatch: 'etag-1',
    });
  });
});
