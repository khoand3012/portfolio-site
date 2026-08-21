import { describe, expect, it } from 'vitest';
import { isAllowedEmail } from './allowedEmails';

describe('isAllowedEmail', () => {
  it('allows an email on the list, case-insensitively', () => {
    expect(
      isAllowedEmail(
        'Owner@Example.com',
        'owner@example.com, other@example.com',
      ),
    ).toBe(true);
  });

  it('rejects an email not on the list', () => {
    expect(isAllowedEmail('stranger@example.com', 'owner@example.com')).toBe(
      false,
    );
  });

  it('rejects when the allow-list env var is missing', () => {
    expect(isAllowedEmail('owner@example.com', undefined)).toBe(false);
  });

  it('rejects when there is no email', () => {
    expect(isAllowedEmail(null, 'owner@example.com')).toBe(false);
  });
});
