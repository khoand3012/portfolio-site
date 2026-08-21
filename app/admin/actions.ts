'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { savePortfolioContent } from '../../src/lib/portfolioContent';
import type { PortfolioData } from '../../src/types';

const REQUIRED_TAB_KEYS: (keyof PortfolioData['tabs'])[] = [
  'teaching',
  'internationalEducation',
  'testing',
  'academicBackground',
  'publications',
  'talks',
  'media',
];

// Now that app/page.tsx renders live (see the `dynamic = 'force-dynamic'`
// export added there), whatever gets saved here goes straight to the public
// page, unvalidated, on the very next request. This is a shape guard against
// garbage input — not a full schema validator — so it only checks that the
// top-level fields the public page actually reads (`hero`, `footer`, and
// each tab's `label`/`blocks`) are present, not every field of every block.
function assertPortfolioDataShape(
  data: unknown,
): asserts data is PortfolioData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid content shape: not an object');
  }
  const record = data as Record<string, unknown>;
  if (typeof record.hero !== 'object' || record.hero === null) {
    throw new Error('Invalid content shape: missing hero');
  }
  if (typeof record.footer !== 'string') {
    throw new Error('Invalid content shape: missing footer');
  }
  if (typeof record.tabs !== 'object' || record.tabs === null) {
    throw new Error('Invalid content shape: missing tabs');
  }
  const tabs = record.tabs as Record<string, unknown>;
  for (const key of REQUIRED_TAB_KEYS) {
    const tab = tabs[key];
    if (typeof tab !== 'object' || tab === null) {
      throw new Error(`Invalid content shape: missing tabs.${key}`);
    }
    const { label, blocks } = tab as Record<string, unknown>;
    if (typeof label !== 'string' || !Array.isArray(blocks)) {
      throw new Error(`Invalid content shape: missing tabs.${key}`);
    }
  }
}

export async function saveContentAction(data: unknown): Promise<void> {
  const session = await auth();
  // Re-check server-side even though middleware already gates /admin — this
  // action can in principle be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  assertPortfolioDataShape(data);
  await savePortfolioContent(data);
}
