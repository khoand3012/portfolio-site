'use client';

import type { Data } from '@puckeditor/core';
import { Button, Puck, usePuck } from '@puckeditor/core';
import { createAiPlugin } from '@puckeditor/plugin-ai';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { saveTabBlocksAction } from '../../app/admin/actions';
import { puckConfig } from '../../puck.config';
import { blocksToPuckData, puckDataToBlocks } from '../lib/puckAdapter';
import { toast } from '../lib/use-toast';
import type { Hero, PortfolioData, Tab } from '../types';
import { HeroForm } from './HeroForm';
import { TabManager } from './TabManager';
import { Toaster } from './Toaster';

// Never set `chat.examplePrompts` here — per the puck skill's AI guidance,
// invented example prompts read as first-party product copy and should only
// ever be authored by the site owner, not generated.
const aiPlugin = createAiPlugin();

interface Props {
  initialData: PortfolioData;
  userEmail?: string | null;
}

/** Which full-screen editor sits over the canvas, if any. */
type Panel = 'hero' | 'tabs' | null;

// Inline SVGs rather than an icon package: the only one already in the tree is
// lucide-react, and that is a transitive dependency of Puck's own bundle, not
// something this app declares — importing it directly would break the day Puck
// drops it. Same approach as MetaItem.tsx.
const icon = (paths: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

const HERO_ICON = icon(
  <>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
);
const TABS_ICON = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" />
  </>,
);
const PREVIEW_ICON = icon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
const EDIT_ICON = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </>,
);

// Puck's own previewMode: 'interactive' renders the page as a visitor sees it
// (links clickable, no drag handles), 'edit' is the editor. Toggling it shows
// UNSAVED work, which opening the public site in a tab cannot do — the public
// page only ever renders what has been published.
function PreviewToggle() {
  const { appState, dispatch } = usePuck();
  const previewing = appState.ui.previewMode === 'interactive';

  return (
    <Button
      variant="secondary"
      icon={previewing ? EDIT_ICON : PREVIEW_ICON}
      onClick={() =>
        dispatch({
          type: 'setUi',
          ui: { previewMode: previewing ? 'edit' : 'interactive' },
        })
      }
    >
      {previewing ? 'Back to editing' : 'Preview'}
    </Button>
  );
}

function PanelOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Escape closes, matching every other dismissible layer on the web. The
  // listener is on document because focus may sit inside a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="admin-panel-backdrop">
      <div
        className="admin-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="admin-panel-bar">
          <button type="button" className="admin-panel-close" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <div className="admin-panel-body">{children}</div>
      </div>
    </div>
  );
}

export function PuckAdmin({ initialData, userEmail }: Props) {
  const router = useRouter();
  // The document is client state, seeded once from the server props. Every
  // save action returns what it actually stored and we apply that here, so
  // the tab bar and the editors reflect a publish immediately — rather than
  // depending on router.refresh() to re-render the server component and hand
  // fresh props down, which the client cannot sequence against and which left
  // a renamed or newly added tab invisible until a manual reload.
  const [tabs, setTabs] = useState<Tab[]>(initialData.tabs);
  const [hero, setHero] = useState<Hero>(initialData.hero);
  const [activeTabId, setActiveTabId] = useState<string>(
    initialData.tabs[0]?.id ?? '',
  );
  const [panel, setPanel] = useState<Panel>(null);

  // Ref guard, not just an empty dependency array: React 18 Strict Mode
  // (dev only) mounts every effect twice, which would otherwise fire this
  // toast twice on first load.
  const signedInToastShown = useRef(false);
  useEffect(() => {
    if (signedInToastShown.current || !userEmail) return;
    signedInToastShown.current = true;
    toast({ description: `Signed in as ${userEmail}` });
  }, [userEmail]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  function handleTabsSaved(saved: Tab[]) {
    setTabs(saved);
    // The open editor's tab may have just been deleted; fall back to the first
    // remaining one rather than leaving the canvas pointed at nothing.
    if (!saved.some((t) => t.id === activeTabId)) {
      setActiveTabId(saved[0]?.id ?? '');
    }
    router.refresh();
  }

  // Parsing/deriving blocks and saving them fail for different reasons — keep
  // the messages distinct rather than collapsing both into one generic
  // "save failed", same rationale as the placeholder editor this replaces
  // (see commit 628c522, "save-error clarity").
  async function handlePublish(data: Data) {
    try {
      const blocks = puckDataToBlocks(data);
      const saved = await saveTabBlocksAction(activeTabId, blocks);
      // Store what the server sanitized and stored, so switching away from
      // this tab and back re-mounts <Puck> with the published content rather
      // than the blocks this component was first rendered with.
      setTabs((current) =>
        current.map((tab) =>
          tab.id === activeTabId ? { ...tab, blocks: saved } : tab,
        ),
      );
      toast({ description: 'Saved.' });
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Rendered inside <Puck>, so PreviewToggle can reach Puck's own store. Puck
  // hands us its existing actions (the Publish button) as `children`; ours sit
  // before it so Publish stays the last, primary action.
  const headerActions = ({ children }: { children: ReactNode }) => (
    <>
      <PreviewToggle />
      <Button
        variant="secondary"
        icon={HERO_ICON}
        onClick={() => setPanel('hero')}
      >
        Edit hero
      </Button>
      <Button
        variant="secondary"
        icon={TABS_ICON}
        onClick={() => setPanel('tabs')}
      >
        Manage tabs
      </Button>
      {children}
    </>
  );

  return (
    <div>
      <nav className="tabs tabs-admin">
        <div className="wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab-btn${t.id === activeTabId ? ' active' : ''}`}
              onClick={() => setActiveTabId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <Toaster />
      {/* key={activeTab.id} forces a remount with fresh `data` when switching tabs —
          Puck owns its state internally after mount, so this is how a new
          initial document gets loaded. `data` must not change after `<Puck>`
          mounts (per the puck skill) — remounting via `key` is the supported
          way to load a different document, not a workaround. */}
      {/* height leaves room for the tab nav above it — <Puck> defaults to
          100dvh, which would otherwise push part of the editor off-screen.
          Rendered as a direct child of the page (not inside `.wrap`, which
          caps width at 1040px) so the canvas gets full width and
          drag-and-drop isn't offset by an ancestor's box constraints. */}
      {activeTab ? (
        <Puck
          key={activeTab.id}
          config={puckConfig}
          data={blocksToPuckData(activeTab.blocks)}
          onPublish={handlePublish}
          plugins={[aiPlugin]}
          overrides={{ headerActions }}
          height="calc(100dvh - 3rem)"
        />
      ) : (
        // No <Puck> means no header, so this state carries its own way into
        // the tab manager — otherwise a site with every tab deleted would be
        // unrecoverable from the UI.
        <div className="wrap admin-empty">
          <p>This site has no tabs yet.</p>
          <button type="button" onClick={() => setPanel('tabs')}>
            Manage tabs
          </button>
        </div>
      )}
      {panel === 'tabs' && (
        <PanelOverlay title="Tabs" onClose={() => setPanel(null)}>
          <TabManager tabs={tabs} onSaved={handleTabsSaved} />
        </PanelOverlay>
      )}
      {panel === 'hero' && (
        <PanelOverlay title="Hero" onClose={() => setPanel(null)}>
          <HeroForm hero={hero} onSaved={setHero} />
        </PanelOverlay>
      )}
    </div>
  );
}
