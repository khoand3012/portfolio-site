'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import {
  getPortfolioContent,
  savePortfolioContent,
} from '../../src/lib/portfolioContent';
import type { Block, PortfolioData } from '../../src/types';

const REQUIRED_TAB_KEYS: (keyof PortfolioData['tabs'])[] = [
  'teaching',
  'internationalEducation',
  'testing',
  'academicBackground',
  'publications',
  'talks',
  'media',
];

function isKnownTabKey(key: unknown): key is keyof PortfolioData['tabs'] {
  return (
    typeof key === 'string' && (REQUIRED_TAB_KEYS as string[]).includes(key)
  );
}

// PuckAdmin's onPublish hands this whatever puckDataToBlocks (Task 16) derives
// from the editor's live component tree — content this app never validated on
// the way in. Since app/page.tsx renders live (`dynamic = 'force-dynamic'`),
// whatever passes this guard reaches the public page on the very next
// request. This is a shape guard against garbage input, not a full schema
// validator — same spirit and rigor as the assertPortfolioDataShape this
// function replaces, just scoped one level down to a single tab's Block[]
// instead of the whole PortfolioData document.
function assertBlocksShape(
  data: unknown,
  tabKey: keyof PortfolioData['tabs'],
): asserts data is Block[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `Invalid content shape: tabs.${tabKey}.blocks is not an array`,
    );
  }
  data.forEach((block, i) => {
    const label = `tabs.${tabKey}.blocks[${i}]`;
    if (typeof block !== 'object' || block === null) {
      throw new Error(`Invalid content shape: ${label} is not an object`);
    }
    const record = block as Record<string, unknown>;
    switch (record.type) {
      case 'job':
        if (
          typeof record.company !== 'string' ||
          typeof record.dates !== 'string'
        ) {
          throw new Error(
            `Invalid content shape: ${label} (job) missing company/dates`,
          );
        }
        break;
      case 'placeholder':
        if (
          typeof record.company !== 'string' ||
          typeof record.note !== 'string'
        ) {
          throw new Error(
            `Invalid content shape: ${label} (placeholder) missing company/note`,
          );
        }
        break;
      case 'education':
        if (
          typeof record.school !== 'string' ||
          typeof record.dates !== 'string' ||
          typeof record.degree !== 'string'
        ) {
          throw new Error(
            `Invalid content shape: ${label} (education) missing school/dates/degree`,
          );
        }
        break;
      case 'certificate-group':
        if (
          typeof record.heading !== 'string' ||
          !Array.isArray(record.certificates)
        ) {
          throw new Error(
            `Invalid content shape: ${label} (certificate-group) missing heading/certificates`,
          );
        }
        break;
      case 'gallery-item':
        if (record.itemType !== 'photo' && record.itemType !== 'video') {
          throw new Error(
            `Invalid content shape: ${label} (gallery-item) has invalid itemType`,
          );
        }
        break;
      case 'note':
        if (typeof record.text !== 'string') {
          throw new Error(
            `Invalid content shape: ${label} (note) missing text`,
          );
        }
        break;
      default:
        throw new Error(
          `Invalid content shape: ${label} has unknown block type "${String(record.type)}"`,
        );
    }
  });
}

export async function saveTabBlocksAction(
  tabKey: keyof PortfolioData['tabs'],
  blocks: Block[],
): Promise<void> {
  const session = await auth();
  // Re-check server-side even though middleware already gates /admin — this
  // action can in principle be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  // tabKey crosses the same trust boundary as blocks does (it's a server
  // action parameter, not a value this function derived itself). An unknown
  // key would spread `undefined` into `current.tabs[tabKey]` below, saving a
  // tab with `blocks` but no `label` — exactly the kind of malformed document
  // assertPortfolioDataShape used to reject before this action existed.
  if (!isKnownTabKey(tabKey)) {
    throw new Error(
      `Invalid content shape: unknown tab key "${String(tabKey)}"`,
    );
  }
  assertBlocksShape(blocks, tabKey);
  const current = await getPortfolioContent();
  const updated: PortfolioData = {
    ...current,
    tabs: { ...current.tabs, [tabKey]: { ...current.tabs[tabKey], blocks } },
  };
  await savePortfolioContent(updated);
}
