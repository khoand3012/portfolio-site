interface Props {
  icon: 'phone' | 'mail' | 'linkedin' | 'pin' | 'calendar';
  text?: string;
  href?: string;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
const ICON_PATHS: Record<Props['icon'], string> = {
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  linkedin:
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};

export function MetaItem({ icon, text, href }: Props) {
  if (!text) return null;

  const isExternal = href ? /^https?:/.test(href) : false;
  // Cast is safe: href is only ever passed when Tag is 'a'.
  const Tag = (href ? 'a' : 'span') as React.ElementType;

  return (
    <Tag
      className="meta-item"
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener' : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
        dangerouslySetInnerHTML={{ __html: ICON_PATHS[icon] }}
      />
      {text}
    </Tag>
  );
}
