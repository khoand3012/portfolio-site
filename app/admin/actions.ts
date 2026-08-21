'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { savePortfolioContent } from '../../src/lib/portfolioContent';
import type { PortfolioData } from '../../src/types';

export async function saveContentAction(data: PortfolioData): Promise<void> {
  const session = await auth();
  // Re-check server-side even though middleware already gates /admin — this
  // action can in principle be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  await savePortfolioContent(data);
}
