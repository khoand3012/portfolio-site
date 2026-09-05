// src/lib/tabSlugs.ts
//
// Tab ids are stable but opaque, so DOM ids come from the label instead —
// keeping the readable id="tab-teaching" anchors the page has always had,
// without storing a second identifier that can drift from the label.
// Every emitted slug is registered, not just the base it was derived from.
// An earlier version tracked only bases, so a label slugifying to "talks-1"
// collided with the disambiguated form of a second "Talks" — duplicate DOM
// ids on the page and duplicate React keys in TabbedContent. Labels are
// owner-supplied and arbitrary once the tab manager exists, so the suffixed
// form has to be treated as claimed too, and the suffix has to keep
// advancing until it finds an opening.
export function deriveSlugs(tabs: { label: string }[]): string[] {
  const used = new Set<string>();
  return tabs.map((tab, i) => {
    const base =
      tab.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `tab-${i}`;
    // The tab's own index is the first suffix tried, so slugs stay stable
    // against the list rather than depending on how many collisions came
    // before them.
    let slug = base;
    let suffix = i;
    while (used.has(slug)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(slug);
    return slug;
  });
}
