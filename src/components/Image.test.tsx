import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    // which this repo doesn't set (see GalleryTile.test.tsx for the same
    // pattern), so an unscoped query would also match the previous test's
    // "+ Add photo" left in document.body.
    const { container } = render(<Image block={{ type: 'image' }} />);
    expect(within(container).getByText('+ Add photo')).toBeInTheDocument();
  });
});
