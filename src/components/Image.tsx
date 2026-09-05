import type { ImageBlock } from '../types';

interface Props {
  block: ImageBlock;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
export const PHOTO_ICON_PATHS =
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
export const VIDEO_ICON_PATHS =
  '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

// Carried over from GalleryTile.tsx unchanged: an admin-supplied URL must be
// proven http(s) before it becomes an href or src, so a javascript: value can
// never be rendered as a live URL.
export function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function MediaPlaceholder({
  paths,
  label,
}: {
  paths: string;
  label: string;
}) {
  return (
    <div className="gallery-tile">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
        dangerouslySetInnerHTML={{ __html: paths }}
      />
      {label}
    </div>
  );
}

export function Image({ block }: Props) {
  if (!block.src || !isSafeHttpUrl(block.src)) {
    return <MediaPlaceholder paths={PHOTO_ICON_PATHS} label="+ Add photo" />;
  }
  return (
    <figure className="media-figure">
      {/* biome-ignore lint/performance/noImgElement: block.src is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass. */}
      <img className="media-image" src={block.src} alt={block.alt ?? ''} />
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
