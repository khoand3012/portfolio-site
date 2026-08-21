import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryTile } from './GalleryTile';

describe('GalleryTile', () => {
  it('renders a playable link when a video has a URL', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video', videoUrl: 'https://example.com/v' }} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/v');
    expect(screen.getByText('Watch video')).toBeInTheDocument();
  });

  it('renders an add-video prompt when a video has no URL', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'video' }} />);
    expect(screen.getByText('+ Add video')).toBeInTheDocument();
  });

  it('renders an image when a photo has one', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo', image: 'https://example.com/p.jpg' }} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/p.jpg');
  });

  it('renders an add-photo prompt when a photo has no image', () => {
    render(<GalleryTile item={{ type: 'gallery-item', itemType: 'photo' }} />);
    expect(screen.getByText('+ Add photo')).toBeInTheDocument();
  });
});
