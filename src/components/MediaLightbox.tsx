'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import type { LightboxItem } from '../lib/mediaTile';

type OpenLightbox = (item: LightboxItem) => void;

// Defaults to null rather than a no-op so a consumer can tell the two paths
// apart: inside the provider (the public page) a tile becomes a lightbox
// trigger, outside it (puck.config.tsx's editor path) it stays inert. This is
// the seam that keeps the overlay out of /admin.
const LightboxContext = createContext<OpenLightbox | null>(null);

export function useMediaLightbox(): OpenLightbox | null {
  return useContext(LightboxContext);
}

function LightboxMedia({ item }: { item: LightboxItem }) {
  if (item.kind === 'image') {
    return (
      // biome-ignore lint/performance/noImgElement: the src is an arbitrary admin-supplied URL already proven http(s); next/image would need remotePatterns configured first.
      <img className="media-lightbox-media" src={item.src} alt={item.alt} />
    );
  }

  if (item.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: caption text is optional site-owner content rendered below the player; no timed-track data exists for these files.
      <video
        className="media-lightbox-media"
        controls
        autoPlay
        preload="metadata"
        poster={item.poster}
        src={item.src}
      />
    );
  }

  // embedUrl is built by parseVideoEmbed from a validated provider id — it is
  // never a URL the site owner typed, so nothing arbitrary can be framed here.
  return (
    <iframe
      className="media-lightbox-media media-lightbox-embed"
      src={item.embedUrl}
      title={item.caption || 'Video'}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

export function MediaLightboxProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<LightboxItem | null>(null);
  // The overlay opens from a callback, not from a <Dialog.Trigger>, so Radix
  // has no trigger element to hand focus back to on close. Remember the tile
  // ourselves and restore to it, or a keyboard user closing the overlay is
  // dropped back at the top of the document.
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((next: LightboxItem) => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setItem(next);
  }, []);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {/* Keyed on the item so switching tiles remounts the media: without it
          a <video> would keep playing the previous file's buffered stream. */}
      <Dialog.Root
        open={item !== null}
        onOpenChange={(open) => {
          if (!open) setItem(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="media-lightbox-overlay" />
          <Dialog.Content
            className="media-lightbox-content"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              openerRef.current?.focus();
            }}
          >
            {item && <LightboxMedia key={keyFor(item)} item={item} />}
            {/* Radix requires a Title for the dialog's accessible name. When
                there is a caption it IS that title, rendered as the visible
                caption below the media — one element, so a screen reader
                doesn't hear the same words twice. */}
            {item?.caption ? (
              <Dialog.Title asChild>
                <p className="media-lightbox-caption">{item.caption}</p>
              </Dialog.Title>
            ) : (
              <Dialog.Title className="media-lightbox-title-hidden">
                Media preview
              </Dialog.Title>
            )}
            <Dialog.Close
              className="media-lightbox-close"
              aria-label="Close preview"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </LightboxContext.Provider>
  );
}

function keyFor(item: LightboxItem): string {
  return item.kind === 'embed' ? item.embedUrl : item.src;
}
