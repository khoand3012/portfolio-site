import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Video } from './Video';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('Video', () => {
  it('renders a video element in embed mode', () => {
    const { container } = render(
      <Video
        block={{
          type: 'video',
          mode: 'embed',
          url: 'https://cdn.example/a.mp4',
        }}
      />,
    );
    expect(container.querySelector('video')).not.toBeNull();
  });

  // The grid tile is a thumbnail, not a player: the first frame (or the
  // poster) stands in, and the overlay is where the video actually plays.
  it('renders the embed-mode tile as a still frame rather than a player', () => {
    const { container } = render(
      <Video
        block={{
          type: 'video',
          mode: 'embed',
          url: 'https://cdn.example/a.mp4',
          poster: 'https://cdn.example/p.jpg',
        }}
      />,
    );
    const video = container.querySelector('video');
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('poster', 'https://cdn.example/p.jpg');
  });

  it('renders a link tile in link mode', () => {
    const { container } = render(
      <Video
        block={{
          type: 'video',
          mode: 'link',
          url: 'https://youtube.example/w',
        }}
      />,
    );
    const link = within(container).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://youtube.example/w');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('refuses a non-http URL in either mode', () => {
    const { container: embed } = render(
      <Video
        block={{ type: 'video', mode: 'embed', url: 'javascript:alert(1)' }}
      />,
    );
    expect(embed.querySelector('video')).toBeNull();

    const { container: linked } = render(
      <Video
        block={{ type: 'video', mode: 'link', url: 'javascript:alert(1)' }}
      />,
    );
    expect(linked.querySelector('a')).toBeNull();
  });

  it('renders the caption when present', () => {
    render(
      <Video
        block={{
          type: 'video',
          mode: 'link',
          url: 'https://v.example/x',
          caption: 'Talk',
        }}
      />,
    );
    expect(screen.getByText('Talk')).toBeInTheDocument();
  });

  it('marks every playable tile with a play badge', () => {
    const { container: embed } = render(
      <Video
        block={{
          type: 'video',
          mode: 'embed',
          url: 'https://cdn.example/a.mp4',
        }}
      />,
    );
    expect(embed.querySelector('.media-play')).not.toBeNull();

    const { container: linked } = render(
      <Video block={{ type: 'video', mode: 'link', url: YOUTUBE }} />,
    );
    expect(linked.querySelector('.media-play')).not.toBeNull();
  });

  describe('thumbnails', () => {
    it("falls back to YouTube's own thumbnail when the block has no poster", () => {
      const { container } = render(
        <Video block={{ type: 'video', mode: 'link', url: YOUTUBE }} />,
      );
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      );
    });

    it('prefers an explicit poster over the derived thumbnail', () => {
      const { container } = render(
        <Video
          block={{
            type: 'video',
            mode: 'link',
            url: YOUTUBE,
            poster: 'https://cdn.example/p.jpg',
          }}
        />,
      );
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://cdn.example/p.jpg',
      );
    });

    it('shows the placeholder tile for a link with no poster and no derivable thumbnail', () => {
      const { container } = render(
        <Video
          block={{ type: 'video', mode: 'link', url: 'https://v.example/x' }}
        />,
      );
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('.gallery-tile')).not.toBeNull();
    });
  });

  // onOpen is the public page's lightbox hook. puck.config.tsx renders Video
  // without it, which is what keeps the overlay out of the admin editor.
  describe('when given an onOpen handler', () => {
    it('opens the overlay instead of navigating for an embeddable link', async () => {
      const onOpen = vi.fn();
      const { container } = render(
        <Video
          block={{ type: 'video', mode: 'link', url: YOUTUBE }}
          onOpen={onOpen}
        />,
      );
      const link = within(container).getByRole('link');
      // The anchor survives so the tile still works without JS; the handler
      // is what suppresses the navigation when JS is running.
      expect(link).toHaveAttribute('href', YOUTUBE);
      await userEvent.click(link);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('leaves a non-embeddable link navigating normally', async () => {
      const onOpen = vi.fn();
      const { container } = render(
        <Video
          block={{ type: 'video', mode: 'link', url: 'https://v.example/x' }}
          onOpen={onOpen}
        />,
      );
      await userEvent.click(within(container).getByRole('link'));
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('makes an embed-mode tile an activatable button', async () => {
      const onOpen = vi.fn();
      const { container } = render(
        <Video
          block={{
            type: 'video',
            mode: 'embed',
            url: 'https://cdn.example/a.mp4',
            caption: 'Keynote',
          }}
          onOpen={onOpen}
        />,
      );
      await userEvent.click(within(container).getByRole('button'));
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('stays inert when the URL was refused', () => {
      const { container } = render(
        <Video
          block={{ type: 'video', mode: 'embed', url: 'javascript:alert(1)' }}
          onOpen={() => {}}
        />,
      );
      expect(within(container).queryByRole('button')).toBeNull();
    });
  });

  it('renders no button without an onOpen handler', () => {
    const { container } = render(
      <Video
        block={{
          type: 'video',
          mode: 'embed',
          url: 'https://cdn.example/a.mp4',
        }}
      />,
    );
    expect(within(container).queryByRole('button')).toBeNull();
  });
});

// The hover scale rides on .media-link-interactive, not on .media-link, so
// that a link tile rendered by the editor (no onOpen) doesn't get it — the
// anchor itself exists in both paths.
describe('Video hover-scale marker', () => {
  it('marks a link tile interactive only when the overlay can play it', () => {
    const { container: playable } = render(
      <Video
        block={{ type: 'video', mode: 'link', url: YOUTUBE }}
        onOpen={() => {}}
      />,
    );
    expect(playable.querySelector('.media-link-interactive')).not.toBeNull();

    const { container: notPlayable } = render(
      <Video
        block={{ type: 'video', mode: 'link', url: 'https://v.example/x' }}
        onOpen={() => {}}
      />,
    );
    expect(notPlayable.querySelector('.media-link-interactive')).toBeNull();
  });
});
