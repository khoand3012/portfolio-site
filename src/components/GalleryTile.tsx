import type { GalleryItemBlock } from '../types';

interface Props {
  item: GalleryItemBlock;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
const PHOTO_ICON_PATHS =
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
const VIDEO_ICON_PATHS =
  '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function GalleryTile({ item }: Props) {
  if (item.itemType === 'video') {
    if (item.videoUrl && isSafeHttpUrl(item.videoUrl)) {
      return (
        <a
          className="gallery-tile"
          href={item.videoUrl}
          target="_blank"
          rel="noopener"
          style={{ textDecoration: 'none' }}
        >
          {item.image ? (
            <img
              src={item.image}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
            />
          ) : (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
              />
              <span>Watch video</span>
            </>
          )}
        </a>
      );
    }
    return (
      <div className="gallery-tile">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
        />
        + Add video
      </div>
    );
  }

  if (item.image) {
    return (
      <div className="gallery-tile" style={{ padding: 0, overflow: 'hidden' }}>
        <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div className="gallery-tile">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: PHOTO_ICON_PATHS }}
      />
      + Add photo
    </div>
  );
}
