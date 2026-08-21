import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { AdminEditorPlaceholder } from '../../src/components/AdminEditorPlaceholder';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { getPortfolioContent } from '../../src/lib/portfolioContent';

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
    <div className="wrap">
      <p>Signed in as {session?.user?.email}</p>
      <AdminEditorPlaceholder initialData={data} />
    </div>
  );
}
