// src/lib/mediaTile.ts
//
// The two questions a media block has to answer twice — once for the grid
// tile it renders and once for the lightbox it opens — kept in one place so
// the tile and the overlay can never disagree about a block.
//
// Every URL that leaves here has already been proven safe: http(s) for
// anything that becomes a src, and a provider-built embed URL (never the
// owner's own string) for anything that becomes an iframe.

import { isSafeHttpUrl } from '../components/Image';
import type { ImageBlock, VideoBlock } from '../types';
import { parseVideoEmbed } from './videoEmbed';

/** What the lightbox shows. `null` means a block it cannot open at all. */
export type LightboxItem =
  | { kind: 'image'; src: string; alt: string; caption?: string }
  | { kind: 'video'; src: string; poster?: string; caption?: string }
  | { kind: 'embed'; embedUrl: string; caption?: string };

/**
 * The still image a video tile shows: the owner's own poster when they set
 * one, otherwise the provider's thumbnail for a recognised link.
 *
 * An embed-mode block gets nothing here — its URL is a video file, so the
 * <video> element shows its own first frame and there is no provider page to
 * ask. (Its `poster` attribute is handled separately, by Video.tsx.)
 */
export function videoPoster(block: VideoBlock): string | undefined {
  if (block.poster && isSafeHttpUrl(block.poster)) return block.poster;
  if (block.mode !== 'link' || !block.url) return undefined;
  return parseVideoEmbed(block.url)?.thumbnailUrl;
}

export function lightboxItemFor(
  block: ImageBlock | VideoBlock,
): LightboxItem | null {
  if (block.type === 'image') {
    if (!block.src || !isSafeHttpUrl(block.src)) return null;
    return {
      kind: 'image',
      src: block.src,
      alt: block.alt ?? '',
      caption: block.caption,
    };
  }

  if (!block.url || !isSafeHttpUrl(block.url)) return null;

  if (block.mode === 'embed') {
    return {
      kind: 'video',
      src: block.url,
      poster:
        block.poster && isSafeHttpUrl(block.poster) ? block.poster : undefined,
      caption: block.caption,
    };
  }

  // A link the lightbox can't play — an arbitrary page, say — returns null so
  // the tile keeps its plain "open in a new tab" behaviour.
  const embed = parseVideoEmbed(block.url);
  if (!embed) return null;
  return { kind: 'embed', embedUrl: embed.embedUrl, caption: block.caption };
}
