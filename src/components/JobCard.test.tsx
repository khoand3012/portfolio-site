import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobCard } from './JobCard';

describe('JobCard', () => {
  it('omits the role paragraph and bullet list when absent', () => {
    render(<JobCard job={{ type: 'job', company: 'Acme', dates: '2020' }} />);
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders bullets when present', () => {
    render(
      <JobCard
        job={{
          type: 'job',
          company: 'Acme',
          dates: '2020',
          role: 'Engineer',
          bullets: ['Did a thing.'],
        }}
      />,
    );
    expect(screen.getByText('Did a thing.')).toBeInTheDocument();
  });
});
