'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { SaveConflictError } from '../../src/lib/blobStore';
import {
  readPortfolioContentWithEtag,
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

// Optional fields still need a shape check when present — the components
// that render them (JobCard.tsx, EducationCard.tsx, CertificateGroup.tsx,
// GalleryTile.tsx) call `.map`/property access on these unconditionally
// once they're truthy, so a wrong-shaped-but-truthy value (e.g. a string
// where an array is expected) throws at render time on the public page
// instead of failing here at save time.
function assertOptionalStringArray(
  value: unknown,
  label: string,
  field: string,
): void {
  if (value !== undefined && !isStringArray(value)) {
    throw new Error(
      `Invalid content shape: ${label} has a non-string-array ${field}`,
    );
  }
}

function assertOptionalString(
  value: unknown,
  label: string,
  field: string,
): void {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(
      `Invalid content shape: ${label} has a non-string ${field}`,
    );
  }
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
        assertOptionalString(record.role, label, 'role');
        assertOptionalStringArray(record.bullets, label, 'bullets');
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
        assertOptionalStringArray(record.bullets, label, 'bullets');
        assertOptionalString(record.dissertation, label, 'dissertation');
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
        record.certificates.forEach((cert, ci) => {
          const certLabel = `${label}.certificates[${ci}]`;
          if (typeof cert !== 'object' || cert === null) {
            throw new Error(
              `Invalid content shape: ${certLabel} is not an object`,
            );
          }
          const certRecord = cert as Record<string, unknown>;
          if (typeof certRecord.text !== 'string') {
            throw new Error(`Invalid content shape: ${certLabel} missing text`);
          }
          if (
            certRecord.accent !== undefined &&
            typeof certRecord.accent !== 'boolean'
          ) {
            throw new Error(
              `Invalid content shape: ${certLabel} has a non-boolean accent`,
            );
          }
        });
        break;
      case 'gallery-item':
        if (record.itemType !== 'photo' && record.itemType !== 'video') {
          throw new Error(
            `Invalid content shape: ${label} (gallery-item) has invalid itemType`,
          );
        }
        assertOptionalString(record.image, label, 'image');
        assertOptionalString(record.videoUrl, label, 'videoUrl');
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
  // Strict, non-fail-soft read: a transient store read failure must throw
  // here rather than silently fall back to seed data, since this is the
  // read half of a read-modify-write — see the comment on
  // readPortfolioContentWithEtag in src/lib/portfolioContent.ts. A thrown
  // error here propagates up through this server action and is caught by
  // PuckAdmin.tsx's handlePublish, which reports "Save failed: ..." — that
  // is strictly better than silently saving a corrupted document over
  // hero/footer/the other six tabs.
  const { data: current, etag } = await readPortfolioContentWithEtag();
  const updated: PortfolioData = {
    ...current,
    tabs: { ...current.tabs, [tabKey]: { ...current.tabs[tabKey], blocks } },
  };
  try {
    await savePortfolioContent(updated, { ifMatch: etag });
  } catch (error) {
    // Someone else's save landed between this action's read and write —
    // surface that plainly rather than let the second writer silently
    // discard the first writer's change. See blobStore.ts's ContentStore
    // for what this check does and doesn't guarantee.
    if (error instanceof SaveConflictError) {
      throw new Error(
        'Someone else saved changes to this tab while you were editing. Reload the page and reapply your edit.',
      );
    }
    throw error;
  }
}
