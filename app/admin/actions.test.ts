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

function emptyTab(label: string) {
  return { label, blocks: [] };
}

function fixtureContent(): PortfolioData {
  return {
    hero: {
      name: 'Test',
      initials: 'T',
      role: 'Role',
      profile: 'Profile',
    },
    tabs: {
      teaching: emptyTab('Teaching'),
      internationalEducation: emptyTab('International Education'),
      testing: emptyTab('Testing'),
      academicBackground: emptyTab('Academic Background'),
      publications: emptyTab('Publications'),
      talks: emptyTab('Talks'),
      media: emptyTab('Media'),
    },
    footer: 'Footer',
  };
}

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

  it('rejects an unknown tab key', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately passing an invalid tab key to test the guard.
      saveTabBlocksAction('bogus-tab' as any, []),
    ).rejects.toThrow('unknown tab key');
  });

  it('saves valid blocks for every block type', async () => {
    await saveTabBlocksAction('teaching', [
      { type: 'job', company: 'Acme', dates: '2020', bullets: ['Did a thing'] },
      { type: 'placeholder', company: 'Acme', note: 'Coming soon' },
      {
        type: 'education',
        school: 'State U',
        dates: '2020',
        degree: 'BSc',
        bullets: ['Studied things'],
      },
      {
        type: 'certificate-group',
        heading: 'Certs',
        certificates: [{ text: 'PMP', accent: true }],
      },
      { type: 'gallery-item', itemType: 'photo', image: 'https://x/y.png' },
      { type: 'note', text: 'A note' },
    ]);
    expect(savePortfolioContent).toHaveBeenCalledWith(expect.anything(), {
      ifMatch: 'etag-1',
    });
  });

  it('rejects a job block whose bullets is not an array', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to test the shape guard.
        { type: 'job', company: 'Acme', dates: '2020', bullets: 'oops' } as any,
      ]),
    ).rejects.toThrow('non-string-array bullets');
  });

  it('rejects an education block whose dissertation is not a string', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        {
          type: 'education',
          school: 'State U',
          dates: '2020',
          degree: 'BSc',
          dissertation: 123,
          // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to test the shape guard.
        } as any,
      ]),
    ).rejects.toThrow('non-string dissertation');
  });

  it('rejects a certificate-group item missing text', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        {
          type: 'certificate-group',
          heading: 'Certs',
          certificates: [{ accent: true }],
          // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to test the shape guard.
        } as any,
      ]),
    ).rejects.toThrow('certificates[0] missing text');
  });

  it('rejects a certificate-group item that is not an object', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        {
          type: 'certificate-group',
          heading: 'Certs',
          certificates: ['PMP'],
          // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed to test the shape guard.
        } as any,
      ]),
    ).rejects.toThrow('certificates[0] is not an object');
  });

  it('rejects a gallery-item block whose image is not a string', async () => {
    await expect(
      saveTabBlocksAction('teaching', [
        {
          type: 'gallery-item',
          itemType: 'photo',
          image: 42,
        } as unknown as never,
      ]),
    ).rejects.toThrow('non-string image');
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
