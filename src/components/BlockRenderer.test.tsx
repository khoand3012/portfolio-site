import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';
import { MediaLightboxProvider } from './MediaLightbox';

const container = (children: Block[]): Block => ({
  type: 'container',
  children,
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'card',
});

describe('BlockRenderer', () => {
  it('renders nested containers to full depth', () => {
    render(
      <BlockRenderer
        block={container([
          container([{ type: 'heading', text: 'Deep', level: 'h3' }]),
        ])}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Deep' })).toBeInTheDocument();
  });

  it('renders each leaf variant', () => {
    render(
      <BlockRenderer
        block={container([
          { type: 'heading', text: 'Acme', level: 'h3' },
          { type: 'dates', text: '2020' },
          { type: 'text', html: '<p>Role</p>', variant: 'subtitle' },
          { type: 'bullets', items: ['<p>Did a thing.</p>'] },
          { type: 'badge', text: 'IELTS', year: '2025' },
        ])}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Did a thing.')).toBeInTheDocument();
    expect(screen.getByText('IELTS')).toBeInTheDocument();
  });
});

// The lightbox is a public-page feature. BlockRenderer is the public page's
// render path; puck.config.tsx renders Image/Video directly and never through
// here, so wiring the trigger at this level is what keeps /admin inert.
describe('BlockRenderer media triggers', () => {
  const media: Block[] = [
    { type: 'image', src: 'https://cdn.example/a.jpg', alt: 'A photo' },
    { type: 'video', mode: 'embed', url: 'https://cdn.example/a.mp4' },
  ];

  it('makes image and video tiles open the lightbox inside a provider', async () => {
    const { container: root } = render(
      <MediaLightboxProvider>
        <BlockRenderer block={container(media)} />
      </MediaLightboxProvider>,
    );
    const buttons = within(root).getAllByRole('button');
    expect(buttons).toHaveLength(2);

    await userEvent.click(buttons[0] as HTMLElement);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('leaves the tiles inert with no provider above them', () => {
    const { container: root } = render(
      <BlockRenderer block={container(media)} />,
    );
    expect(within(root).queryByRole('button')).toBeNull();
  });
});
