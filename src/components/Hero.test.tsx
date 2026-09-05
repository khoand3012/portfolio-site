import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders contact links only for fields that are present', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          initials: 'TNN',
          role: 'Programme Coordinator',
          email: 'truongnam307@gmail.com',
          profile: 'Professional summary.',
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Truong Nam Nguyen' }),
    ).toBeInTheDocument();
    const emailLink = screen.getByRole('link');
    expect(emailLink).toHaveAttribute('href', 'mailto:truongnam307@gmail.com');
    // No phone/linkedin/location were provided, so only one meta link renders.
  });

  it('renders dob as a meta item and credential under the role, only when present', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          initials: 'TNN',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
          dob: '1 Jan 1995',
          credential: 'PRINCE2 Practitioner',
        }}
      />,
    );

    expect(screen.getByText('1 Jan 1995')).toBeInTheDocument();
    expect(screen.getByText('PRINCE2 Practitioner')).toBeInTheDocument();
  });

  it('omits dob and credential when absent', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          initials: 'TNN',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
        }}
      />,
    );

    expect(screen.queryByText('PRINCE2 Practitioner')).not.toBeInTheDocument();
  });
});
