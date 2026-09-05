import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../app/admin/actions', () => ({ saveHeroAction: vi.fn() }));

import { saveHeroAction } from '../../app/admin/actions';
import type { Hero } from '../types';
import { HeroForm } from './HeroForm';

const hero: Hero = {
  name: 'Truong Nam Nguyen',
  initials: 'TNN',
  role: 'Programme Coordinator',
  phone: '+84 90 832 9797',
  email: 'truongnam307@gmail.com',
  linkedin: 'linkedin.com/in/x',
  location: 'Hanoi, Vietnam',
  dob: '1 Jan 1995',
  credential: 'PRINCE2 Practitioner',
  profile: 'Professional summary.',
};

describe('HeroForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveHeroAction).mockResolvedValue(hero);
  });

  it('pre-fills every field from the current hero', () => {
    render(<HeroForm hero={hero} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Truong Nam Nguyen');
    expect(screen.getByLabelText('Initials')).toHaveValue('TNN');
    expect(screen.getByLabelText('Role')).toHaveValue('Programme Coordinator');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('1 Jan 1995');
    expect(screen.getByLabelText('Credential')).toHaveValue(
      'PRINCE2 Practitioner',
    );
    expect(screen.getByLabelText('Profile')).toHaveValue(
      'Professional summary.',
    );
  });

  it('publishes edited fields byte-for-byte, without rewording', async () => {
    const user = userEvent.setup();
    render(<HeroForm hero={hero} />);
    const dobInput = screen.getByLabelText('Date of birth');
    await user.clear(dobInput);
    await user.type(dobInput, '2 Feb 1996');
    await user.click(screen.getByRole('button', { name: 'Publish hero' }));
    expect(saveHeroAction).toHaveBeenCalledWith({
      ...hero,
      dob: '2 Feb 1996',
    });
  });

  it('sends optional fields cleared to empty as undefined, not empty strings', async () => {
    const user = userEvent.setup();
    render(<HeroForm hero={hero} />);
    await user.clear(screen.getByLabelText('Date of birth'));
    await user.click(screen.getByRole('button', { name: 'Publish hero' }));
    const sent = vi.mocked(saveHeroAction).mock.calls[0]?.[0];
    expect(sent?.dob).toBeUndefined();
  });

  it('surfaces a failed save without dropping the edits', async () => {
    const user = userEvent.setup();
    vi.mocked(saveHeroAction).mockRejectedValue(new Error('Not authorized.'));
    render(<HeroForm hero={hero} />);
    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Edited Name');
    await user.click(screen.getByRole('button', { name: 'Publish hero' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Edited Name');
    expect(screen.getByRole('button', { name: 'Publish hero' })).toBeEnabled();
  });
});
