import { lightboxItemFor, videoPoster } from '../lib/mediaTile';
import type { VideoBlock } from '../types';
import {
  isSafeHttpUrl,
  MediaFrame,
  MediaPlaceholder,
  PlayBadge,
  VIDEO_ICON_PATHS,
} from './Image';

interface Props {
  block: VideoBlock;
  /** See the note on Image's `onOpen` — public page only, never the editor. */
  onOpen?: () => void;
}

export function Video({ block, onOpen }: Props) {
  if (!block.url || !isSafeHttpUrl(block.url)) {
    return (
      <figure className="media-figure">
        <div className="media-frame">
          <MediaPlaceholder paths={VIDEO_ICON_PATHS} label="+ Add video" />
        </div>
      </figure>
    );
  }

  const poster = videoPoster(block);
  const label = block.caption ? `Play ${block.caption}` : 'Play video';

  // mode is an explicit stored choice, not sniffed from the URL: an R2 object
  // URL need not end in .mp4, and a YouTube watch URL will never play in a
  // <video> element, so neither case is reliably detectable.
  if (block.mode === 'embed') {
    return (
      <figure className="media-figure">
        <MediaFrame onOpen={onOpen} label={label}>
          {/* A still frame, not a player: no `controls`, and muted so a
              browser will render the first frame without user interaction.
              The video actually plays in the lightbox. */}
          <video
            className="media-video"
            preload="metadata"
            muted
            playsInline
            poster={poster}
            src={block.url}
          />
          <PlayBadge />
        </MediaFrame>
        {block.caption && (
          <figcaption className="media-caption">{block.caption}</figcaption>
        )}
      </figure>
    );
  }

  // Link mode keeps its anchor whether or not the lightbox is available, so
  // the tile still reaches the video with JavaScript off and stays keyboard
  // reachable. When the overlay CAN play this URL, the click handler
  // suppresses the navigation instead of a button replacing the link.
  const playsInOverlay =
    onOpen !== undefined && lightboxItemFor(block) !== null;

  return (
    <figure className="media-figure">
      <div className="media-frame">
        <a
          className={
            playsInOverlay ? 'media-link media-link-interactive' : 'media-link'
          }
          href={block.url}
          target="_blank"
          rel="noopener"
          aria-label={label}
          onClick={
            playsInOverlay
              ? (event) => {
                  event.preventDefault();
                  onOpen?.();
                }
              : undefined
          }
        >
          {poster ? (
            // biome-ignore lint/performance/noImgElement: block.poster is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass.
            <img className="media-image" src={poster} alt="" />
          ) : (
            <MediaPlaceholder paths={VIDEO_ICON_PATHS} label="Watch video" />
          )}
          <PlayBadge />
        </a>
      </div>
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
