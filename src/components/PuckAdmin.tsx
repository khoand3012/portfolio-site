'use client';

import type { Data } from '@puckeditor/core';
import { Puck } from '@puckeditor/core';
import { createAiPlugin } from '@puckeditor/plugin-ai';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { saveTabBlocksAction } from '../../app/admin/actions';
import { puckConfig } from '../../puck.config';
import { blocksToPuckData, puckDataToBlocks } from '../lib/puckAdapter';
import { toast } from '../lib/use-toast';
import type { PortfolioData } from '../types';
import { Toaster } from './Toaster';

// Never set `chat.examplePrompts` here — per the puck skill's AI guidance,
// invented example prompts read as first-party product copy and should only
// ever be authored by the site owner, not generated.
const aiPlugin = createAiPlugin();

interface Props {
  initialData: PortfolioData;
  userEmail?: string | null;
}

export function PuckAdmin({ initialData, userEmail }: Props) {
  const router = useRouter();
  const [activeTabId, setActiveTabId] = useState(initialData.tabs[0]?.id ?? '');

  // Ref guard, not just an empty dependency array: React 18 Strict Mode
  // (dev only) mounts every effect twice, which would otherwise fire this
  // toast twice on first load.
  const signedInToastShown = useRef(false);
  useEffect(() => {
    if (signedInToastShown.current || !userEmail) return;
    signedInToastShown.current = true;
    toast({ description: `Signed in as ${userEmail}` });
  }, [userEmail]);

  const activeTab = initialData.tabs.find((t) => t.id === activeTabId);

  // Parsing/deriving blocks and saving them fail for different reasons — keep
  // the messages distinct rather than collapsing both into one generic
  // "save failed", same rationale as the placeholder editor this replaces
  // (see commit 628c522, "save-error clarity").
  async function handlePublish(data: Data) {
    try {
      const blocks = puckDataToBlocks(data);
      await saveTabBlocksAction(activeTabId, blocks);
      toast({ description: 'Saved.' });
      // `initialData` is a server-component prop, fetched once when
      // AdminPage rendered — it does not update just because a save
      // succeeded. Without this, switching away from the just-saved tab
      // and back re-mounts <Puck> (via key={activeTab.id}) with the SAME
      // stale `initialData.tabs[...].blocks`, showing pre-publish
      // content even though the save genuinely succeeded. router.refresh()
      // re-runs AdminPage (a Server Component, already
      // `dynamic = 'force-dynamic'` per Ruling A) so it re-calls
      // getPortfolioContent() and this component receives fresh
      // `initialData` on the next render — without a full page reload or
      // losing the "Saved." toast just shown.
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return (
    <div>
      <nav className="tabs">
        <div className="wrap">
          {initialData.tabs.map((t) => (
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
      {/* Note on router.refresh() above: it re-renders this component with a
          fresh `initialData` prop, so `data={blocksToPuckData(...)}` below
          technically produces a new object identity on that re-render even
          though <Puck> stays mounted (same key={activeTab.id}). This is
          harmless, not an unhandled bug — Puck only reads `data` once, at
          mount, as the initial document; it does not re-sync on every
          re-render of a changed `data` prop. The refetched blocks are also
          byte-equivalent to what was just published, so even if Puck did
          re-read it, there'd be nothing to reconcile. */}
      {activeTab ? (
        <Puck
          key={activeTab.id}
          config={puckConfig}
          data={blocksToPuckData(activeTab.blocks)}
          onPublish={handlePublish}
          plugins={[aiPlugin]}
          height="calc(100dvh - 3rem)"
        />
      ) : (
        <div className="wrap">
          <p>This site has no tabs yet.</p>
        </div>
      )}
    </div>
  );
}
