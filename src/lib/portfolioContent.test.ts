import { beforeEach, describe, expect, it, vi } from 'vitest';

const memoryStore = new Map<string, unknown>();

vi.mock('./blobStore', () => ({
  getContentStore: () => ({
    get: async (key: string) => memoryStore.get(key) ?? null,
    setJSON: async (key: string, value: unknown) => {
      memoryStore.set(key, value);
    },
  }),
}));

import {
  getPortfolioContent,
  readPortfolioContentStrict,
  savePortfolioContent,
} from './portfolioContent';

describe('portfolioContent', () => {
  beforeEach(() => {
    memoryStore.clear();
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
});
