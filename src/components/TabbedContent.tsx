'use client';

import { useState } from 'react';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';
import { TabStrip } from './TabStrip';

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
      {/* The strip owns its own horizontal scrolling and the arrows that go
          with it; this component stays responsible for which tab is active
          and for the panels below. */}
      <TabStrip tabs={tabs} activeSlug={activeSlug} onSelect={setActiveSlug} />

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
