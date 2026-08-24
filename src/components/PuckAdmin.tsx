'use client';

import type { Data } from '@puckeditor/core';
import { Puck } from '@puckeditor/core';
import { useState } from 'react';
import { saveTabBlocksAction } from '../../app/admin/actions';
import { puckConfig } from '../../puck.config';
import { blocksToPuckData, puckDataToBlocks } from '../lib/puckAdapter';
import type { PortfolioData } from '../types';

const TAB_ORDER: { key: keyof PortfolioData['tabs']; label: string }[] = [
  { key: 'teaching', label: 'Teaching' },
  { key: 'internationalEducation', label: 'International Education' },
  { key: 'testing', label: 'Testing' },
  { key: 'academicBackground', label: 'Academic Background' },
  { key: 'publications', label: 'Publications' },
  { key: 'talks', label: 'Talks' },
  { key: 'media', label: 'Media' },
];

interface Props {
  initialData: PortfolioData;
}

export function PuckAdmin({ initialData }: Props) {
  // biome-ignore lint/style/noNonNullAssertion: TAB_ORDER is a fixed, non-empty literal declared above.
  const [activeKey, setActiveKey] = useState(TAB_ORDER[0]!.key);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [errorMessage, setErrorMessage] = useState('');

  const activeTab = initialData.tabs[activeKey];

  // Parsing/deriving blocks and saving them fail for different reasons — keep
  // the messages distinct rather than collapsing both into one generic
  // "save failed", same rationale as the placeholder editor this replaces
  // (see commit 628c522, "save-error clarity").
  async function handlePublish(data: Data) {
    setStatus('saving');
    try {
      const blocks = puckDataToBlocks(data);
      await saveTabBlocksAction(activeKey, blocks);
      setErrorMessage('');
      setStatus('saved');
    } catch (error) {
      setErrorMessage(
        `Save failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      setStatus('error');
    }
  }

  return (
    <div>
      <nav className="tabs">
        <div className="wrap">
          {TAB_ORDER.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-btn${t.key === activeKey ? ' active' : ''}`}
              onClick={() => {
                setActiveKey(t.key);
                setStatus('idle');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      {status === 'saved' && <p className="wrap">Saved.</p>}
      {status === 'error' && <p className="wrap">{errorMessage}</p>}
      {/* key={activeKey} forces a remount with fresh `data` when switching tabs —
          Puck owns its state internally after mount, so this is how a new
          initial document gets loaded. `data` must not change after `<Puck>`
          mounts (per the puck skill) — remounting via `key` is the supported
          way to load a different document, not a workaround. */}
      {/* height leaves room for the tab nav / status line above it — <Puck>
          defaults to 100dvh, which would otherwise push part of the editor
          off-screen. Rendered as a direct child of the page (not inside
          `.wrap`, which caps width at 1040px) so the canvas gets full width
          and drag-and-drop isn't offset by an ancestor's box constraints. */}
      <Puck
        key={activeKey}
        config={puckConfig}
        data={blocksToPuckData(activeTab.blocks)}
        onPublish={handlePublish}
        height="calc(100dvh - 3rem)"
      />
    </div>
  );
}
