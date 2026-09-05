import { Hero } from '../src/components/Hero';
import { TabbedContent } from '../src/components/TabbedContent';
import { getPortfolioContent } from '../src/lib/portfolioContent';
import { deriveSlugs } from '../src/lib/tabSlugs';

// Without this, Next.js statically prerenders this page at build time, so
// saved admin edits never reach the deployed public page — the entire point
// of the admin panel. Force it to render per-request instead.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const data = await getPortfolioContent();
  const slugs = deriveSlugs(data.tabs);

  const tabs = data.tabs.map((tab, i) => ({
    // biome-ignore lint/style/noNonNullAssertion: deriveSlugs returns one slug per tab, by construction.
    slug: slugs[i]!,
    label: tab.label,
    blocks: tab.blocks,
  }));

  return (
    <>
      <Hero hero={data.hero} />
      <TabbedContent tabs={tabs} />
      <footer>
        <div className="wrap">{data.footer}</div>
      </footer>
    </>
  );
}
