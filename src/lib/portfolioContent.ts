import seedData from '../../content/portfolio.json';
import type { PortfolioData } from '../types';
import { getContentStore } from './blobStore';
import { migratePortfolioData } from './contentMigration';

const STORE_NAME = 'portfolio';
const CURRENT_KEY = 'current.json';

function historyKey(): string {
  return `history/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

// Strict read: throws on a genuine store read failure instead of swallowing
// it into seed data. This is the read half of saveTabBlocksAction's
// read-modify-write in app/admin/actions.ts — silently falling back to seed
// data here would mean a transient read failure during a save overwrites
// hero/footer/the other six tabs with seed content, keeping only the tab
// being edited — exactly the silent-content-corruption this guardrail-heavy
// project exists to prevent. getPortfolioContent() below is the fail-soft
// version, correct for the PUBLIC page's degrade-gracefully behavior — it is
// NOT safe to use as the read half of a write.
export async function readPortfolioContentStrict(): Promise<PortfolioData> {
  const store = getContentStore(STORE_NAME);
  const current = await store.get(CURRENT_KEY);
  // Migrate on read rather than as a one-off script: production content lives
  // in Netlify Blobs with no convenient script access, and this covers every
  // history/ snapshot for free. migratePortfolioData is deterministic, so the
  // same stored bytes always yield the same tab ids — load-bearing for
  // saveTabBlocksAction's id lookup.
  return migratePortfolioData(current ?? seedData);
}

// Same strict read as above, plus the etag it was read at — the write half
// of a read-modify-write needs both: the content to modify, and a value to
// hand back to savePortfolioContent's `ifMatch` so a concurrent save in
// between is detected instead of silently overwritten. See blobStore.ts's
// ContentStore.setJSON for what that check does and doesn't guarantee.
export async function readPortfolioContentWithEtag(): Promise<{
  data: PortfolioData;
  etag: string | null;
}> {
  const store = getContentStore(STORE_NAME);
  const [current, etag] = await Promise.all([
    store.get(CURRENT_KEY),
    store.getEtag(CURRENT_KEY),
  ]);
  return { data: migratePortfolioData(current ?? seedData), etag };
}

export async function getPortfolioContent(): Promise<PortfolioData> {
  try {
    return await readPortfolioContentStrict();
  } catch (error) {
    // A store read failure (not just "nothing saved yet") should degrade to the
    // seed content rather than break the public page — see spec's Error handling section.
    console.error(
      'Failed to read portfolio content from the content store, falling back to seed data:',
      error,
    );
    return migratePortfolioData(seedData);
  }
}

export async function savePortfolioContent(
  data: PortfolioData,
  options?: { ifMatch?: string | null },
): Promise<void> {
  const store = getContentStore(STORE_NAME);
  // Throws SaveConflictError instead of writing if `options.ifMatch` no
  // longer matches the stored etag — see readPortfolioContentWithEtag and
  // blobStore.ts's ContentStore.setJSON.
  await store.setJSON(CURRENT_KEY, data, options);
  // Timestamped snapshot on every save — this is the "git diff before commit"
  // safety net a git-tracked file gave for free, now that content lives in a
  // Blob/local store instead of a git-tracked file.
  await store.setJSON(historyKey(), data);
}
