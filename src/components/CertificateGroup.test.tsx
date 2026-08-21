import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CertificateGroup } from './CertificateGroup';

describe('CertificateGroup', () => {
  it('renders the heading and each certificate, marking accented ones', () => {
    render(
      <CertificateGroup
        group={{
          type: 'certificate-group',
          heading: 'Certificates',
          certificates: [
            { text: 'IELTS Academic — 8.0', accent: true },
            { text: 'HSK Level 3', accent: false },
          ],
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument();
    expect(screen.getByText('IELTS Academic — 8.0')).toHaveClass('tag', 'accent');
    expect(screen.getByText('HSK Level 3')).toHaveClass('tag');
    expect(screen.getByText('HSK Level 3')).not.toHaveClass('accent');
  });
});
