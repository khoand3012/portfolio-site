import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';

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
