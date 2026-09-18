import { describe, expect, it } from 'vitest';
import { parseVideoEmbed } from './videoEmbed';

describe('parseVideoEmbed', () => {
  describe('YouTube', () => {
    it('parses a standard watch URL', () => {
      expect(
        parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toEqual({
        provider: 'youtube',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      });
    });

    it('parses a youtu.be short URL', () => {
      expect(parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      );
    });

    it('parses an /embed/ URL', () => {
      expect(
        parseVideoEmbed('https://www.youtube.com/embed/dQw4w9WgXcQ')?.embedUrl,
      ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('parses a /shorts/ URL', () => {
      expect(
        parseVideoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.embedUrl,
      ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('accepts the m. and youtube-nocookie hosts', () => {
      expect(
        parseVideoEmbed('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.provider,
      ).toBe('youtube');
      expect(
        parseVideoEmbed('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
          ?.provider,
      ).toBe('youtube');
    });

    it('ignores extra query parameters', () => {
      expect(
        parseVideoEmbed(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc',
        )?.embedUrl,
      ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('rejects an id that is not exactly 11 id-safe characters', () => {
      expect(
        parseVideoEmbed('https://www.youtube.com/watch?v=short'),
      ).toBeNull();
      expect(
        parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQextra'),
      ).toBeNull();
      expect(
        parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgX/Q'),
      ).toBeNull();
    });

    it('rejects a watch URL with no id at all', () => {
      expect(parseVideoEmbed('https://www.youtube.com/watch')).toBeNull();
    });
  });

  describe('Vimeo', () => {
    it('parses a vimeo.com URL', () => {
      expect(parseVideoEmbed('https://vimeo.com/123456789')).toEqual({
        provider: 'vimeo',
        embedUrl: 'https://player.vimeo.com/video/123456789',
      });
    });

    it('parses a player.vimeo.com URL', () => {
      expect(
        parseVideoEmbed('https://player.vimeo.com/video/123456789')?.embedUrl,
      ).toBe('https://player.vimeo.com/video/123456789');
    });

    it('offers no thumbnail, because Vimeo has no static thumbnail URL', () => {
      expect(
        parseVideoEmbed('https://vimeo.com/123456789')?.thumbnailUrl,
      ).toBeUndefined();
    });

    it('rejects a non-numeric id', () => {
      expect(
        parseVideoEmbed('https://vimeo.com/channels/staffpicks'),
      ).toBeNull();
    });
  });

  describe('rejection', () => {
    it('returns null for a host outside the allow-list', () => {
      expect(
        parseVideoEmbed('https://evil.example.com/embed/dQw4w9WgXcQ'),
      ).toBeNull();
    });

    // A suffix match on "youtube.com" would frame this attacker-controlled host.
    it('rejects a look-alike host that merely ends with an allowed domain', () => {
      expect(
        parseVideoEmbed('https://notyoutube.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
      expect(
        parseVideoEmbed('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('rejects a non-http(s) protocol even on an allowed host', () => {
      expect(
        parseVideoEmbed('javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBeNull();
    });

    it('rejects userinfo smuggling the allowed host into the credentials', () => {
      expect(
        parseVideoEmbed(
          'https://www.youtube.com@evil.test/watch?v=dQw4w9WgXcQ',
        ),
      ).toBeNull();
    });

    it('returns null for an unparseable or empty URL', () => {
      expect(parseVideoEmbed('not a url')).toBeNull();
      expect(parseVideoEmbed('')).toBeNull();
    });
  });

  // The embed URL is BUILT from a validated id, never carried over from the
  // input, so nothing an owner pastes can reach an iframe src verbatim.
  it('never returns the input URL itself as the embed URL', () => {
    const input = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&onerror=x';
    expect(parseVideoEmbed(input)?.embedUrl).not.toContain('onerror');
  });
});
