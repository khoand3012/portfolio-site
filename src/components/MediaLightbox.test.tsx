import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LightboxItem } from '../lib/mediaTile';
import { MediaLightboxProvider, useMediaLightbox } from './MediaLightbox';

function OpenButton({ item, label }: { item: LightboxItem; label: string }) {
  const open = useMediaLightbox();
  return (
    <button type="button" onClick={() => open?.(item)}>
      {label}
    </button>
  );
}

function renderWithLightbox(item: LightboxItem, label = 'open') {
  return render(
    <MediaLightboxProvider>
      <OpenButton item={item} label={label} />
    </MediaLightboxProvider>,
  );
}

const IMAGE: LightboxItem = {
  kind: 'image',
  src: 'https://cdn.example/a.jpg',
  alt: 'A photo',
  caption: 'On stage in Hanoi',
};

describe('MediaLightbox', () => {
  it('shows nothing until a tile is opened', () => {
    const { container } = renderWithLightbox(IMAGE, 'first');
    expect(within(container).queryByRole('dialog')).toBeNull();
  });

  it('shows the image at full size with its caption', async () => {
    renderWithLightbox(IMAGE, 'show-image');
    await userEvent.click(screen.getByText('show-image'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByAltText('A photo')).toHaveAttribute(
      'src',
      'https://cdn.example/a.jpg',
    );
    expect(within(dialog).getByText('On stage in Hanoi')).toBeInTheDocument();
  });

  it('plays an embed-mode file in a real player', async () => {
    renderWithLightbox(
      { kind: 'video', src: 'https://cdn.example/a.mp4', caption: 'Keynote' },
      'show-video',
    );
    await userEvent.click(screen.getByText('show-video'));

    const dialog = await screen.findByRole('dialog');
    const video = dialog.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://cdn.example/a.mp4');
    expect(video).toHaveAttribute('controls');
  });

  it('frames a provider video at the URL the parser built', async () => {
    renderWithLightbox(
      {
        kind: 'embed',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        caption: 'Conference talk',
      },
      'show-embed',
    );
    await userEvent.click(screen.getByText('show-embed'));

    const dialog = await screen.findByRole('dialog');
    const frame = dialog.querySelector('iframe');
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(frame).toHaveAttribute('allowfullscreen');
  });

  it('closes on Escape', async () => {
    renderWithLightbox(IMAGE, 'show-esc');
    await userEvent.click(screen.getByText('show-esc'));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes from its close button', async () => {
    renderWithLightbox(IMAGE, 'show-close');
    await userEvent.click(screen.getByText('show-close'));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: /close/i }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // Every tile that opens the overlay is itself a control; losing the focus
  // position would strand a keyboard user at the top of the page.
  it('returns focus to the tile that opened it', async () => {
    renderWithLightbox(IMAGE, 'show-focus');
    const trigger = screen.getByText('show-focus');
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  // The hook is the seam that keeps the overlay off the admin editor: a tile
  // rendered outside the provider (puck.config.tsx's path) gets no opener.
  it('gives no opener outside a provider', () => {
    function Probe() {
      const open = useMediaLightbox();
      return <span>{open === null ? 'inert' : 'interactive'}</span>;
    }
    const { container } = render(<Probe />);
    expect(within(container).getByText('inert')).toBeInTheDocument();
  });
});
