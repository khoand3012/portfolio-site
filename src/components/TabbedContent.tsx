'use client';

import { useState } from 'react';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';

interface Tab {
  slug: string;
  label: string;
  blocks: Block[];
}

interface Props {
  tabs: Tab[];
}

export function TabbedContent({ tabs }: Props) {
  const [activeSlug, setActiveSlug] = useState(tabs[0]?.slug ?? '');

  return (
    <>
      <nav className="tabs">
        <div className="wrap">
          {tabs.map((tab) => (
            <button
              key={tab.slug}
              type="button"
              className={`tab-btn${tab.slug === activeSlug ? ' active' : ''}`}
              onClick={() => setActiveSlug(tab.slug)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        <div className="wrap">
          {tabs.map((tab) => (
            <section
              key={tab.slug}
              id={`tab-${tab.slug}`}
              className={`tab-panel${tab.slug === activeSlug ? ' active' : ''}`}
            >
              {tab.blocks.map((block, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Blocks don't reorder client-side outside the admin panel, so index keys are safe here.
                <BlockRenderer key={i} block={block} />
              ))}
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
