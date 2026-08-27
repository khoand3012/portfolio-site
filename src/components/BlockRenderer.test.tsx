import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';

describe('BlockRenderer', () => {
  it('dispatches a note block to a rendered <div class="placeholder">', () => {
    const block: Block = { type: 'note', text: 'Nothing here yet.' };
    render(<BlockRenderer block={block} />);
    expect(screen.getByText('Nothing here yet.')).toHaveClass('placeholder');
  });
});
