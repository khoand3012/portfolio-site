import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Image } from './Image';

describe('Image', () => {
  it('renders the image and caption when the src is a safe http URL', () => {
    const { container } = render(
      <Image
        block={{
          type: 'image',
          src: 'https://cdn.example/a.jpg',
          alt: 'A photo',
          caption: 'On stage',
        }}
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example/a.jpg',
    );
    expect(screen.getByAltText('A photo')).toBeInTheDocument();
    expect(screen.getByText('On stage')).toBeInTheDocument();
  });

  // The frame owns the aspect ratio and the overflow clipping, so a tile is
  // the same height whatever it contains and a hover scale can't spill onto
  // its neighbours. See .media-frame in global.css.
  it('wraps the image in a fixed-ratio frame', () => {
    const { container } = render(
      <Image block={{ type: 'image', src: 'https://cdn.example/a.jpg' }} />,
    );
    const frame = container.querySelector('.media-frame');
    expect(frame).not.toBeNull();
    expect(frame?.querySelector('img')).not.toBeNull();
  });

  it('refuses a non-http src and falls back to the empty state', () => {
    const { container } = render(
      <Image block={{ type: 'image', src: 'javascript:alert(1)' }} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(within(container).getByText('+ Add photo')).toBeInTheDocument();
  });

  it('renders the empty state when no src is set', () => {
    // Scoped to this render's container, not the global `screen`: RTL's
    // auto-cleanup-between-tests requires `globals: true` in vitest.config.ts,
    // which this repo doesn't set, so an unscoped query would also match the
    // previous test's "+ Add photo" left in document.body.
    const { container } = render(<Image block={{ type: 'image' }} />);
    expect(within(container).getByText('+ Add photo')).toBeInTheDocument();
  });

  // onOpen is the public page's lightbox hook. puck.config.tsx renders Image
  // without it, which is what keeps the overlay out of the admin editor.
  describe('when given an onOpen handler', () => {
    it('makes the frame an activatable button', async () => {
      const onOpen = vi.fn();
      const { container } = render(
        <Image
          block={{
            type: 'image',
            src: 'https://cdn.example/a.jpg',
            alt: 'A photo',
          }}
          onOpen={onOpen}
        />,
      );
      const button = within(container).getByRole('button');
      await userEvent.click(button);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('names the button from the alt text so it is not an unlabelled control', () => {
      const { container } = render(
        <Image
          block={{
            type: 'image',
            src: 'https://cdn.example/a.jpg',
            alt: 'A photo',
          }}
          onOpen={() => {}}
        />,
      );
      expect(within(container).getByRole('button')).toHaveAccessibleName(
        expect.stringContaining('A photo'),
      );
    });

    it('stays inert when the src was refused', () => {
      const { container } = render(
        <Image block={{ type: 'image' }} onOpen={() => {}} />,
      );
      expect(within(container).queryByRole('button')).toBeNull();
    });
  });

  it('renders no button without an onOpen handler', () => {
    const { container } = render(
      <Image block={{ type: 'image', src: 'https://cdn.example/a.jpg' }} />,
    );
    expect(within(container).queryByRole('button')).toBeNull();
  });
});
