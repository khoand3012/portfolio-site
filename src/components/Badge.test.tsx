import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders the year as a prefix when present', () => {
    render(
      <Badge block={{ type: 'badge', text: 'IELTS 8.0', year: '2025' }} />,
    );
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('IELTS 8.0')).toBeInTheDocument();
  });

  it('applies the accent class only when accent is set', () => {
    const { container, rerender } = render(
      <Badge block={{ type: 'badge', text: 'Plain' }} />,
    );
    expect(container.querySelector('.tag.accent')).toBeNull();
    rerender(<Badge block={{ type: 'badge', text: 'Hot', accent: true }} />);
    expect(container.querySelector('.tag.accent')).not.toBeNull();
  });
});
