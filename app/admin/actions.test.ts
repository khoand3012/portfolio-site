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
import { saveTabBlocksAction } from './actions';

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
