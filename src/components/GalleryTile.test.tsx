import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryTile } from './GalleryTile';

describe('GalleryTile', () => {
  it('renders a playable link when a video has a URL', () => {
    const { container } = render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video', videoUrl: 'https://example.com/v' }} />);
    expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com/v');
    expect(within(container).getByText('Watch video')).toBeInTheDocument();
  });

  it('renders an add-video prompt when a video has no URL', () => {
    const { container } = render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video' }} />);
    expect(within(container).getByText('+ Add video')).toBeInTheDocument();
  });

  it('does not render a link when videoUrl is a javascript: URL', () => {
    const { container } = render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video', videoUrl: 'javascript:alert(1)' }} />);
    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(within(container).getByText('+ Add video')).toBeInTheDocument();
  });

  it('renders an image when a photo has one', () => {
    const { container } = render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo', image: 'https://example.com/p.jpg' }} />);
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/p.jpg');
  });

  it('renders an add-photo prompt when a photo has no image', () => {
    const { container } = render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo' }} />);
    expect(within(container).getByText('+ Add photo')).toBeInTheDocument();
  });
});
