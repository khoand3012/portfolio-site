import type { VideoBlock } from '../types';
import { isSafeHttpUrl, MediaPlaceholder, VIDEO_ICON_PATHS } from './Image';

interface Props {
  block: VideoBlock;
}

export function Video({ block }: Props) {
  if (!block.url || !isSafeHttpUrl(block.url)) {
    return <MediaPlaceholder paths={VIDEO_ICON_PATHS} label="+ Add video" />;
  }

  const poster =
    block.poster && isSafeHttpUrl(block.poster) ? block.poster : undefined;

  // mode is an explicit stored choice, not sniffed from the URL: an R2 object
  // URL need not end in .mp4, and a YouTube watch URL will never play in a
  // <video> element, so neither case is reliably detectable.
  if (block.mode === 'embed') {
    return (
      <figure className="media-figure">
        {/* biome-ignore lint/a11y/useMediaCaption: caption text is optional site-owner content rendered below the player; no timed-track data exists for these files. */}
        <video
          className="media-video"
          controls
          preload="metadata"
          poster={poster}
          src={block.url}
        />
        {block.caption && (
          <figcaption className="media-caption">{block.caption}</figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="media-figure">
      <a
        className="gallery-tile"
        href={block.url}
        target="_blank"
        rel="noopener"
      >
        {poster ? (
          // biome-ignore lint/performance/noImgElement: block.poster is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass.
          <img className="media-image" src={poster} alt="" />
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
              dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
            />
            <span>Watch video</span>
          </>
        )}
      </a>
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
