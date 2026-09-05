'use server';

import { auth } from '../../auth';
import { isAllowedEmail } from '../../src/lib/allowedEmails';
import { SaveConflictError } from '../../src/lib/blobStore';
import {
  isOneOf,
  LAYOUT_ALIGNS,
  LAYOUT_COLUMNS,
  LAYOUT_DIRECTIONS,
  LAYOUT_JUSTIFIES,
  LAYOUT_SPACINGS,
  LAYOUT_SURFACES,
  VIDEO_MODES,
} from '../../src/lib/layoutOptions';
import {
  readPortfolioContentWithEtag,
  savePortfolioContent,
} from '../../src/lib/portfolioContent';
import { sanitizeBlocks } from '../../src/lib/sanitizeBlocks';
import type { Block, Hero, PortfolioData, Tab } from '../../src/types';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
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

const MAX_DEPTH = 6;
const MAX_NODES = 2000;
const MAX_RICHTEXT_CHARS = 20_000;

function assertRichText(value: unknown, label: string, field: string): void {
  if (typeof value !== 'string') {
    throw new Error(
      `Invalid content shape: ${label} has a non-string ${field}`,
    );
  }
  if (value.length > MAX_RICHTEXT_CHARS) {
    throw new Error(
      `Invalid content shape: ${label}'s ${field} exceeds ${MAX_RICHTEXT_CHARS} characters`,
    );
  }
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  label: string,
  field: string,
): void {
  if (!isOneOf(allowed, value)) {
    throw new Error(
      `Invalid content shape: ${label} has an unknown ${field} "${String(value)}"`,
    );
  }
}

// Recursive. The depth and node caps are new: the whole tree serializes into
// one JSON document under one store key, and deep nesting would blow the
// render stack on the public page. The depth cap is enforced here and only
// here — Puck's slot allow/disallow lists are static component-name lists
// with no notion of how deep a slot already sits, so a depth limit cannot be
// expressed in the editor config. 6 is far above any plausible real layout
// (a job entry needs 3).
function assertBlocksShape(
  data: unknown,
  tabLabel: string,
  path = 'blocks',
  depth = 0,
  counter = { n: 0 },
): asserts data is Block[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `Invalid content shape: ${tabLabel}.${path} is not an array`,
    );
  }
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Invalid content shape: ${tabLabel}.${path} nests deeper than ${MAX_DEPTH} levels`,
    );
  }
  data.forEach((block, i) => {
    counter.n += 1;
    if (counter.n > MAX_NODES) {
      throw new Error(
        `Invalid content shape: ${tabLabel} has more than ${MAX_NODES} blocks`,
      );
    }
    const label = `${tabLabel}.${path}[${i}]`;
    if (typeof block !== 'object' || block === null) {
      throw new Error(`Invalid content shape: ${label} is not an object`);
    }
    const record = block as Record<string, unknown>;
    switch (record.type) {
      case 'container':
        assertEnum(record.direction, LAYOUT_DIRECTIONS, label, 'direction');
        assertEnum(record.gap, LAYOUT_SPACINGS, label, 'gap');
        assertEnum(record.padding, LAYOUT_SPACINGS, label, 'padding');
        assertEnum(record.marginBottom, LAYOUT_SPACINGS, label, 'marginBottom');
        assertEnum(record.align, LAYOUT_ALIGNS, label, 'align');
        assertEnum(record.justify, LAYOUT_JUSTIFIES, label, 'justify');
        assertEnum(record.columns, LAYOUT_COLUMNS, label, 'columns');
        assertEnum(record.surface, LAYOUT_SURFACES, label, 'surface');
        if (typeof record.wrap !== 'boolean') {
          throw new Error(
            `Invalid content shape: ${label} has a non-boolean wrap`,
          );
        }
        assertBlocksShape(
          record.children,
          tabLabel,
          `${path}[${i}].children`,
          depth + 1,
          counter,
        );
        break;
      case 'heading':
        if (typeof record.text !== 'string') {
          throw new Error(
            `Invalid content shape: ${label} (heading) missing text`,
          );
        }
        assertEnum(record.level, ['h2', 'h3', 'h4'], label, 'level');
        break;
      case 'text':
        assertRichText(record.html, label, 'html');
        assertEnum(
          record.variant,
          ['body', 'subtitle', 'small'],
          label,
          'variant',
        );
        break;
      case 'dates':
        if (typeof record.text !== 'string') {
          throw new Error(
            `Invalid content shape: ${label} (dates) missing text`,
          );
        }
        break;
      case 'bullets':
        if (!isStringArray(record.items)) {
          throw new Error(
            `Invalid content shape: ${label} (bullets) has a non-string-array items`,
          );
        }
        record.items.forEach((item, ii) => {
          assertRichText(item, `${label}.items[${ii}]`, 'value');
        });
        break;
      case 'badge':
        if (typeof record.text !== 'string') {
          throw new Error(
            `Invalid content shape: ${label} (badge) missing text`,
          );
        }
        if (record.accent !== undefined && typeof record.accent !== 'boolean') {
          throw new Error(
            `Invalid content shape: ${label} has a non-boolean accent`,
          );
        }
        assertOptionalString(record.year, label, 'year');
        break;
      case 'image':
        assertOptionalString(record.src, label, 'src');
        assertOptionalString(record.alt, label, 'alt');
        assertOptionalString(record.caption, label, 'caption');
        break;
      case 'video':
        assertEnum(record.mode, VIDEO_MODES, label, 'mode');
        assertOptionalString(record.url, label, 'url');
        assertOptionalString(record.poster, label, 'poster');
        assertOptionalString(record.caption, label, 'caption');
        break;
      default:
        throw new Error(
          `Invalid content shape: ${label} has unknown block type "${String(record.type)}"`,
        );
    }
  });
}

export async function saveTabBlocksAction(
  tabId: string,
  blocks: Block[],
): Promise<void> {
  const session = await auth();
  // Re-check server-side even though middleware already gates /admin — this
  // action can in principle be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  if (typeof tabId !== 'string' || tabId.length === 0) {
    throw new Error('Invalid content shape: missing tab id');
  }
  assertBlocksShape(blocks, `tabs[${tabId}]`);

  const { data: current, etag } = await readPortfolioContentWithEtag();
  // Validated against the FRESHLY READ document, not a static list — and not
  // redundant with the etag check. Two writers now exist: if the tab manager
  // deleted this tab and then a still-mounted Puck editor publishes, this
  // read happens after that delete, the etag matches, and a naive write would
  // silently resurrect the deleted tab.
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) {
    throw new Error('That tab no longer exists. Reload the page.');
  }

  // Sanitize AFTER the shape guard and before the write: the guard rejects,
  // this rewrites. Disallowed markup is stripped rather than failing the
  // save — see src/lib/sanitizeBlocks.ts.
  const tabs = current.tabs.map((tab, i) =>
    i === index ? { ...tab, blocks: sanitizeBlocks(blocks) } : tab,
  );
  const updated: PortfolioData = { ...current, tabs };

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

const MAX_TABS = 20;

export interface TabMeta {
  id: string;
  label: string;
}

// The tab manager edits the whole list and publishes once, so add, rename,
// reorder and delete all arrive here as a single desired-state list. One
// action with one guard and one etag-protected write is more atomic than
// four granular actions racing each other — and it means a reorder can
// never be observed half-applied.
function assertTabMetasShape(data: unknown): asserts data is TabMeta[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid content shape: tabs is not an array');
  }
  if (data.length > MAX_TABS) {
    throw new Error(
      `Invalid content shape: more than ${MAX_TABS} tabs (the same class of bound as the per-tab block cap)`,
    );
  }
  const ids = new Set<string>();
  data.forEach((meta, i) => {
    const label = `tabs[${i}]`;
    if (typeof meta !== 'object' || meta === null) {
      throw new Error(`Invalid content shape: ${label} is not an object`);
    }
    const record = meta as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.id.length === 0) {
      throw new Error(`Invalid content shape: ${label} has no id`);
    }
    // Trimmed, because a whitespace-only label renders as an unclickable
    // blank tab button on the public page — visible as a gap, impossible to
    // diagnose from the page itself.
    if (typeof record.label !== 'string' || record.label.trim().length === 0) {
      throw new Error(`Invalid content shape: ${label} has an empty label`);
    }
    if (ids.has(record.id)) {
      throw new Error(
        `Invalid content shape: duplicate tab id "${record.id}" — ids must be unique`,
      );
    }
    ids.add(record.id);
  });
}

export async function saveTabsAction(metas: TabMeta[]): Promise<void> {
  const session = await auth();
  // Re-checked server-side for the same reason as every other action here:
  // a server action can be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  assertTabMetasShape(metas);

  const { data: current, etag } = await readPortfolioContentWithEtag();

  // Reconciled against the freshly-read document, so a tab's blocks travel
  // with it through a rename or a reorder. Anything the caller doesn't list
  // is deleted with its content — that is the delete path, and the UI is
  // what makes it deliberate. The recovery path is the timestamped
  // history/<ISO>.json snapshot every save already writes.
  const existing = new Map(current.tabs.map((tab) => [tab.id, tab]));
  const tabs: Tab[] = metas.map((meta) => {
    const previous = existing.get(meta.id);
    return {
      id: meta.id,
      label: meta.label.trim(),
      // An id the document doesn't know is a tab the owner just created:
      // TabManager generates it client-side so it can key the row before
      // this save round-trips.
      blocks: previous?.blocks ?? [],
    };
  });

  const updated: PortfolioData = { ...current, tabs };

  try {
    await savePortfolioContent(updated, { ifMatch: etag });
  } catch (error) {
    if (error instanceof SaveConflictError) {
      throw new Error(
        'Someone else saved changes while you were editing the tabs. Reload the page and reapply your edit.',
      );
    }
    throw error;
  }
}

const HERO_REQUIRED_FIELDS = ['name', 'initials', 'role', 'profile'] as const;
const HERO_OPTIONAL_FIELDS = [
  'phone',
  'email',
  'linkedin',
  'location',
  'dob',
  'credential',
] as const;

function assertHeroShape(data: unknown): asserts data is Hero {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid content shape: hero is not an object');
  }
  const record = data as Record<string, unknown>;
  for (const field of HERO_REQUIRED_FIELDS) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(`Invalid content shape: hero is missing ${field}`);
    }
  }
  for (const field of HERO_OPTIONAL_FIELDS) {
    assertOptionalString(record[field], 'hero', field);
  }
}

export async function saveHeroAction(hero: Hero): Promise<void> {
  const session = await auth();
  // Re-checked server-side for the same reason as every other action here:
  // a server action can be invoked directly, so it must not trust the UI.
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  assertHeroShape(hero);

  // Hero and every tab live in one PortfolioData document, so a concurrent
  // Hero save and tab save are the same class of race as two tab saves —
  // same etag-protected read-modify-write.
  const { data: current, etag } = await readPortfolioContentWithEtag();
  const updated: PortfolioData = { ...current, hero };

  try {
    await savePortfolioContent(updated, { ifMatch: etag });
  } catch (error) {
    if (error instanceof SaveConflictError) {
      throw new Error(
        'Someone else saved changes while you were editing the hero. Reload the page and reapply your edit.',
      );
    }
    throw error;
  }
}
