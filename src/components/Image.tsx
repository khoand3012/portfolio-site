import type { ReactNode } from 'react';
import type { ImageBlock } from '../types';

interface Props {
  block: ImageBlock;
  /**
   * Supplied only by the public page (BlockRenderer), never by
   * puck.config.tsx. Its presence is what turns an inert tile into a
   * lightbox trigger, which is how the overlay stays out of the admin
   * editor — the same explicit dual-path split Container.tsx uses, rather
   * than sniffing Puck's editing state from a shared component.
   */
  onOpen?: () => void;
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

/**
 * Owns the tile's fixed aspect ratio and its overflow clipping (see
 * `.media-frame` in global.css). Every media tile goes through it, so a photo,
 * a video still and an empty placeholder are all exactly the same height —
 * and a hover scale on the contents is clipped instead of spilling over the
 * neighbouring grid cells.
 */
export function MediaFrame({
  children,
  onOpen,
  label,
}: {
  children: ReactNode;
  onOpen?: () => void;
  label?: string;
}) {
  if (!onOpen) {
    return <div className="media-frame">{children}</div>;
  }
  return (
    <button
      type="button"
      className="media-frame media-frame-button"
      onClick={onOpen}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/** Centred play affordance laid over a video tile's still frame. */
export function PlayBadge() {
  return (
    <span className="media-play" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5L8 5.5Z" />
      </svg>
    </span>
  );
}

export function MediaPlaceholder({
  paths,
  label,
  children,
}: {
  paths: string;
  label: string;
  children?: ReactNode;
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
      {children}
    </div>
  );
}

export function Image({ block, onOpen }: Props) {
  if (!block.src || !isSafeHttpUrl(block.src)) {
    return (
      <figure className="media-figure">
        <div className="media-frame">
          <MediaPlaceholder paths={PHOTO_ICON_PATHS} label="+ Add photo" />
        </div>
      </figure>
    );
  }
  return (
    <figure className="media-figure">
      <MediaFrame
        onOpen={onOpen}
        label={block.alt ? `View ${block.alt}` : 'View image'}
      >
        {/* biome-ignore lint/performance/noImgElement: block.src is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass. */}
        <img className="media-image" src={block.src} alt={block.alt ?? ''} />
      </MediaFrame>
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
