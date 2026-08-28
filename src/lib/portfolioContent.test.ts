import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStore = new Map<string, unknown>();
const etagStore = new Map<string, string>();
let etagCounter = 0;

vi.mock('./blobStore', () => ({
  getContentStore: () => ({
    get: async (key: string) => memoryStore.get(key) ?? null,
    getEtag: async (key: string) => etagStore.get(key) ?? null,
    setJSON: async (
      key: string,
      value: unknown,
      options?: { ifMatch?: string | null },
    ) => {
      if (
        options?.ifMatch !== undefined &&
        (etagStore.get(key) ?? null) !== options.ifMatch
      ) {
        throw new Error('simulated conflict: stale ifMatch');
      }
      memoryStore.set(key, value);
      etagStore.set(key, `etag-${++etagCounter}`);
    },
  }),
}));

import {
  getPortfolioContent,
  readPortfolioContentStrict,
  readPortfolioContentWithEtag,
  savePortfolioContent,
} from './portfolioContent';

describe('portfolioContent', () => {
  beforeEach(() => {
    memoryStore.clear();
    etagStore.clear();
    etagCounter = 0;
  });

  it('falls back to the seed file when nothing has been saved yet', async () => {
    const data = await getPortfolioContent();
    expect(data.hero.name).toBe('Truong Nam Nguyen');
  });

  it('returns the saved value once one exists, and writes a history snapshot', async () => {
    const seeded = await getPortfolioContent();
    const updated = { ...seeded, footer: 'Updated footer' };

    await savePortfolioContent(updated);

    const current = await getPortfolioContent();
    expect(current.footer).toBe('Updated footer');

    const historyKeys = [...memoryStore.keys()].filter((k) =>
      k.startsWith('history/'),
    );
    expect(historyKeys).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: The toHaveLength(1) assertion above guarantees index 0 exists.
    expect(memoryStore.get(historyKeys[0]!)).toEqual(updated);
  });

  it('falls back to the seed file if the store read throws, rather than crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalGet = memoryStore.get.bind(memoryStore);
    memoryStore.get = () => {
      throw new Error('simulated store outage');
    };

    const data = await getPortfolioContent();
    expect(data.hero.name).toBe('Truong Nam Nguyen');

    memoryStore.get = originalGet;
  });

  it('readPortfolioContentStrict propagates a store read failure instead of falling back to seed data', async () => {
    const originalGet = memoryStore.get.bind(memoryStore);
    memoryStore.get = () => {
      throw new Error('simulated store outage');
    };

    await expect(readPortfolioContentStrict()).rejects.toThrow(
      'simulated store outage',
    );

    memoryStore.get = originalGet;
  });

  it('getPortfolioContent still falls back to seed data on the same read failure that readPortfolioContentStrict throws on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalGet = memoryStore.get.bind(memoryStore);
    memoryStore.get = () => {
      throw new Error('simulated store outage');
    };

    await expect(readPortfolioContentStrict()).rejects.toThrow(
      'simulated store outage',
    );
    const data = await getPortfolioContent();
    expect(data.hero.name).toBe('Truong Nam Nguyen');

    memoryStore.get = originalGet;
  });

  it('readPortfolioContentWithEtag returns a null etag when nothing has been saved yet', async () => {
    const { data, etag } = await readPortfolioContentWithEtag();
    expect(data.hero.name).toBe('Truong Nam Nguyen');
    expect(etag).toBeNull();
  });

  it('readPortfolioContentWithEtag returns the saved data and a non-null etag once one exists', async () => {
    const seeded = await getPortfolioContent();
    await savePortfolioContent({ ...seeded, footer: 'Updated footer' });

    const { data, etag } = await readPortfolioContentWithEtag();
    expect(data.footer).toBe('Updated footer');
    expect(etag).not.toBeNull();
  });

  it('savePortfolioContent with a matching ifMatch succeeds', async () => {
    const seeded = await getPortfolioContent();
    await savePortfolioContent(seeded);
    const { etag } = await readPortfolioContentWithEtag();

    await expect(
      savePortfolioContent(
        { ...seeded, footer: 'Second save' },
        { ifMatch: etag },
      ),
    ).resolves.toBeUndefined();
    expect((await getPortfolioContent()).footer).toBe('Second save');
  });

  it('savePortfolioContent with a stale ifMatch rejects instead of overwriting', async () => {
    const seeded = await getPortfolioContent();
    await savePortfolioContent(seeded);
    const { etag: staleEtag } = await readPortfolioContentWithEtag();
    // A second save lands in between, moving the store's etag forward.
    await savePortfolioContent({ ...seeded, footer: 'Someone else’s save' });

    await expect(
      savePortfolioContent(
        { ...seeded, footer: 'This should not land' },
        { ifMatch: staleEtag },
      ),
    ).rejects.toThrow('simulated conflict');
    expect((await getPortfolioContent()).footer).toBe('Someone else’s save');
  });
});
