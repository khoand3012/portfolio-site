import '@puckeditor/core/puck.css';
import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { PuckAdmin } from '../../src/components/PuckAdmin';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { getPortfolioContent } from '../../src/lib/portfolioContent';

// The editor needs a fresh session/content read on every visit — it must not
// be statically rendered. (Puck's CSS import above must live in this server
// page, not the client PuckAdmin component, so it ends up in the document
// Puck syncs into its preview iframe — see the puck skill's Next.js App
// Router guidance.)
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await auth();

  // Defense in depth: middleware already gates '/admin' at the routing layer,
  // but this page must not trust that alone — re-check the session and the
  // allow-list here too, and refuse to render any content (including the
  // "Signed in as" line) if the check fails. See this project's Global
  // Constraint: admin/editing routes must be gated by a valid, allow-listed
  // session checked server-side, not just hidden in the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    redirect('/api/auth/signin');
  }

  const data = await getPortfolioContent();

  return (
    <div>
      <p className="wrap">Signed in as {session?.user?.email}</p>
      <PuckAdmin initialData={data} />
    </div>
  );
}
