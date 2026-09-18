import { describe, expect, it } from 'vitest';
import { lightboxItemFor, videoPoster } from './mediaTile';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT_THUMB = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';

describe('videoPoster', () => {
  it('uses an explicit safe poster', () => {
    expect(
      videoPoster({
        type: 'video',
        mode: 'link',
        url: YOUTUBE,
        poster: 'https://c/p.jpg',
      }),
    ).toBe('https://c/p.jpg');
  });

  it("falls back to the provider's thumbnail when no poster is set", () => {
    expect(videoPoster({ type: 'video', mode: 'link', url: YOUTUBE })).toBe(
      YT_THUMB,
    );
  });

  it('ignores an unsafe poster rather than rendering it', () => {
    expect(
      videoPoster({
        type: 'video',
        mode: 'link',
        url: YOUTUBE,
        poster: 'javascript:alert(1)',
      }),
    ).toBe(YT_THUMB);
  });

  it('has nothing to offer for a link with no poster and no known provider', () => {
    expect(
      videoPoster({ type: 'video', mode: 'link', url: 'https://v.example/x' }),
    ).toBeUndefined();
  });

  it('does not derive a thumbnail for an embed-mode file', () => {
    // mode 'embed' means the URL is a video FILE; the <video> element shows
    // its own first frame, so there is no provider page to ask.
    expect(
      videoPoster({
        type: 'video',
        mode: 'embed',
        url: 'https://cdn.example/a.mp4',
      }),
    ).toBeUndefined();
  });
});

describe('lightboxItemFor', () => {
  it('describes an image', () => {
    expect(
      lightboxItemFor({
        type: 'image',
        src: 'https://c/a.jpg',
        alt: 'A',
        caption: 'C',
      }),
    ).toEqual({
      kind: 'image',
      src: 'https://c/a.jpg',
      alt: 'A',
      caption: 'C',
    });
  });

  it('describes an embed-mode video as a playable file', () => {
    expect(
      lightboxItemFor({ type: 'video', mode: 'embed', url: 'https://c/a.mp4' }),
    ).toEqual({
      kind: 'video',
      src: 'https://c/a.mp4',
      poster: undefined,
      caption: undefined,
    });
  });

  it('describes a link-mode provider video as an embed', () => {
    expect(
      lightboxItemFor({
        type: 'video',
        mode: 'link',
        url: YOUTUBE,
        caption: 'Talk',
      }),
    ).toEqual({
      kind: 'embed',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      caption: 'Talk',
    });
  });

  it('has no item for a link the lightbox cannot play', () => {
    expect(
      lightboxItemFor({
        type: 'video',
        mode: 'link',
        url: 'https://v.example/x',
      }),
    ).toBeNull();
  });

  it('has no item for an unsafe or missing URL', () => {
    expect(
      lightboxItemFor({ type: 'image', src: 'javascript:alert(1)' }),
    ).toBeNull();
    expect(lightboxItemFor({ type: 'image' })).toBeNull();
    expect(lightboxItemFor({ type: 'video', mode: 'embed' })).toBeNull();
  });
});
