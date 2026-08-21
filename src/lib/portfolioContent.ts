import { getContentStore } from './blobStore';
import seedData from '../../content/portfolio.json';
import type { PortfolioData } from '../types';

const STORE_NAME = 'portfolio';
const CURRENT_KEY = 'current.json';

function historyKey(): string {
  return `history/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function getPortfolioContent(): Promise<PortfolioData> {
  const store = getContentStore(STORE_NAME);
  try {
    const current = (await store.get(CURRENT_KEY)) as PortfolioData | null;
    return current ?? (seedData as PortfolioData);
  } catch (error) {
    // A store read failure (not just "nothing saved yet") should degrade to the
    // seed content rather than break the public page — see spec's Error handling section.
    console.error('Failed to read portfolio content from the content store, falling back to seed data:', error);
    return seedData as PortfolioData;
  }
}

export async function savePortfolioContent(data: PortfolioData): Promise<void> {
  const store = getContentStore(STORE_NAME);
  await store.setJSON(CURRENT_KEY, data);
  // Timestamped snapshot on every save — this is the "git diff before commit"
  // safety net a git-tracked file gave for free, now that content lives in a
  // Blob/local store instead of a git-tracked file.
  await store.setJSON(historyKey(), data);
}
