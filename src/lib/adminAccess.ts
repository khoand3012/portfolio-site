/**
 * Local-development bypass for the admin panel's auth gate.
 *
 * `/admin` is normally gated at five independent layers (see CLAUDE.md) —
 * that stays true: this module adds a *predicate* those layers consult, it
 * does not merge them into a shared wrapper. Each layer still owns its own
 * check.
 *
 * The bypass requires BOTH conditions below, and that pairing is the point:
 *
 * - `DISABLE_ADMIN_AUTH === 'true'` — an explicit opt-in nothing sets by
 *   default, so a stray `NODE_ENV` never silently opens the panel. Notably
 *   `vitest` runs with `NODE_ENV=test`, which would satisfy the check below
 *   on its own and disable auth inside this repo's own test suite, making
 *   the "Not authorized." assertions in `app/admin/actions.test.ts` pass
 *   vacuously.
 * - `NODE_ENV !== 'production'` — so that even if this var leaks into the
 *   Netlify environment, a production build refuses to honour it.
 *
 * Both are read as direct `process.env.X` property accesses, not dynamic
 * indexing: `middleware.ts` runs in the Edge Runtime, where Next.js only
 * statically inlines the direct form.
 *
 * Deliberately NOT keyed off `process.env.NETLIFY` — `blobStore.ts` already
 * documents why that var isn't a reliable "am I deployed?" signal.
 */
export function isAdminAuthBypassed(): boolean {
  return (
    process.env.DISABLE_ADMIN_AUTH === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
