import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders contact links only for fields that are present', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
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

  it('derives the avatar initials from the name', () => {
    const { container } = render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
        }}
      />,
    );
    expect(container.querySelector('.avatar')).toHaveTextContent('TNN');
  });

  it('ignores a stale stored initials value in favour of the name', () => {
    const { container } = render(
      <Hero
        hero={{
          name: 'Someone Else Entirely',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
        }}
      />,
    );
    expect(container.querySelector('.avatar')).toHaveTextContent('SEE');
  });

  it('renders an uploaded avatar in place of the initials', () => {
    const { container } = render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
          avatarUrl: '/api/media/abc-123.png',
        }}
      />,
    );
    const img = container.querySelector('.avatar-image');
    expect(img).toHaveAttribute('src', '/api/media/abc-123.png');
    // Decorative: the name is already the page's h1, so announcing it twice
    // would just be noise.
    expect(img).toHaveAttribute('alt', '');
    expect(container.querySelector('.avatar')).not.toHaveTextContent('TNN');
  });

  it('falls back to initials rather than rendering an unsafe avatar URL', () => {
    const { container } = render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          role: 'Programme Coordinator',
          profile: 'Professional summary.',
          avatarUrl: 'javascript:alert(1)',
        }}
      />,
    );
    expect(container.querySelector('.avatar-image')).toBeNull();
    expect(container.querySelector('.avatar')).toHaveTextContent('TNN');
  });

  it('renders an empty profile without crashing', () => {
    render(
      <Hero
        hero={{
          name: 'Truong Nam Nguyen',
          role: 'Programme Coordinator',
          profile: '',
        }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Truong Nam Nguyen' }),
    ).toBeInTheDocument();
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
