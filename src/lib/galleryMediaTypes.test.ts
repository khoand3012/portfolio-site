import { describe, expect, it } from 'vitest';
import {
  galleryExtensionForType,
  isUploadedVideoUrl,
  MAX_GALLERY_IMAGE_BYTES,
  MAX_GALLERY_VIDEO_BYTES,
  maxBytesForType,
} from './galleryMediaTypes';

describe('galleryExtensionForType', () => {
  it('accepts the four inert raster image types', () => {
    expect(galleryExtensionForType('image/png')).toBe('png');
    expect(galleryExtensionForType('image/jpeg')).toBe('jpg');
    expect(galleryExtensionForType('image/webp')).toBe('webp');
    expect(galleryExtensionForType('image/gif')).toBe('gif');
  });

  it('accepts the two natively-playable video containers', () => {
    expect(galleryExtensionForType('video/mp4')).toBe('mp4');
    expect(galleryExtensionForType('video/webm')).toBe('webm');
  });

  it('tolerates parameters and casing, both legal in a Content-Type header', () => {
    expect(galleryExtensionForType('IMAGE/PNG')).toBe('png');
    expect(galleryExtensionForType('video/mp4; codecs="avc1.42E01E"')).toBe(
      'mp4',
    );
  });

  // An SVG is an active document and can carry <script>. The avatar allow-list
  // excludes it for the same reason — see mediaTypes.ts.
  it('refuses SVG', () => {
    expect(galleryExtensionForType('image/svg+xml')).toBeNull();
  });

  it('refuses a container the browser cannot reliably play', () => {
    expect(galleryExtensionForType('video/quicktime')).toBeNull();
    expect(galleryExtensionForType('video/x-msvideo')).toBeNull();
  });

  it('refuses anything outside the allow-list', () => {
    expect(galleryExtensionForType('application/x-msdownload')).toBeNull();
    expect(galleryExtensionForType('text/html')).toBeNull();
    expect(galleryExtensionForType('')).toBeNull();
  });
});

describe('maxBytesForType', () => {
  it('caps an image lower than a video', () => {
    expect(maxBytesForType('image/png')).toBe(MAX_GALLERY_IMAGE_BYTES);
    expect(maxBytesForType('video/mp4')).toBe(MAX_GALLERY_VIDEO_BYTES);
    expect(MAX_GALLERY_IMAGE_BYTES).toBeLessThan(MAX_GALLERY_VIDEO_BYTES);
  });

  // The route asks for the cap before it decides to read anything, so an
  // unknown type must not fall through to the larger of the two.
  it('has no cap to offer for a type outside the allow-list', () => {
    expect(maxBytesForType('image/svg+xml')).toBeNull();
    expect(maxBytesForType('application/zip')).toBeNull();
  });
});

describe('isUploadedVideoUrl', () => {
  it('recognises an R2 object this app generated', () => {
    expect(
      isUploadedVideoUrl(
        'https://pub-abc.r2.dev/media/0f8fad5b-d9cb-469f-a165-70867728950e.mp4',
      ),
    ).toBe(true);
  });

  it('recognises the local-dev path too', () => {
    expect(
      isUploadedVideoUrl(
        '/api/media/0f8fad5b-d9cb-469f-a165-70867728950e.webm',
      ),
    ).toBe(true);
  });

  // The point is to recognise OUR OWN generated key, not to guess whether an
  // arbitrary URL happens to be a video — see Video.tsx on why sniffing is
  // the thing this repo avoids.
  it('does not fire on a provider page or an arbitrary .mp4 link', () => {
    expect(
      isUploadedVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(false);
    expect(isUploadedVideoUrl('https://cdn.example/holiday-clip.mp4')).toBe(
      false,
    );
  });

  it('does not fire on an uploaded image', () => {
    expect(
      isUploadedVideoUrl(
        'https://pub-abc.r2.dev/media/0f8fad5b-d9cb-469f-a165-70867728950e.png',
      ),
    ).toBe(false);
  });

  it('is unbothered by an empty or unparseable value', () => {
    expect(isUploadedVideoUrl('')).toBe(false);
    expect(isUploadedVideoUrl('not a url')).toBe(false);
  });
});
