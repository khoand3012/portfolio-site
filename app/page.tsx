import { Hero } from '../src/components/Hero';
import { TabbedContent } from '../src/components/TabbedContent';
import { getPortfolioContent } from '../src/lib/portfolioContent';
import type { PortfolioData } from '../src/types';

const TAB_ORDER: { key: keyof PortfolioData['tabs']; slug: string }[] = [
  { key: 'teaching', slug: 'teaching' },
  { key: 'internationalEducation', slug: 'intl-education' },
  { key: 'testing', slug: 'testing' },
  { key: 'academicBackground', slug: 'academic-background' },
  { key: 'publications', slug: 'publications' },
  { key: 'talks', slug: 'talks' },
  { key: 'media', slug: 'media' },
];

export default async function HomePage() {
  const data = await getPortfolioContent();

  const tabs = TAB_ORDER.map((t) => ({
    slug: t.slug,
    label: data.tabs[t.key].label,
    blocks: data.tabs[t.key].blocks,
    wrapperClassName: t.key === 'media' ? 'gallery-grid' : undefined,
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
