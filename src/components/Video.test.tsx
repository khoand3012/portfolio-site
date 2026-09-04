import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Video } from './Video';

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

  it('renders a link tile in link mode', () => {
    render(
      <Video
        block={{
          type: 'video',
          mode: 'link',
          url: 'https://youtube.example/w',
        }}
      />,
    );
    const link = screen.getByRole('link');
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
});
