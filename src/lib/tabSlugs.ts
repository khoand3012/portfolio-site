// src/lib/tabSlugs.ts
//
// Tab ids are stable but opaque, so DOM ids come from the label instead —
// keeping the readable id="tab-teaching" anchors the page has always had,
// without storing a second identifier that can drift from the label.
export function deriveSlugs(tabs: { label: string }[]): string[] {
  const seen = new Map<string, number>();
  return tabs.map((tab, i) => {
    const base =
      tab.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `tab-${i}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${i}`;
  });
}
