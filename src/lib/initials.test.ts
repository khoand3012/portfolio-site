import { describe, expect, it } from 'vitest';
import { deriveInitials } from './initials';

describe('deriveInitials', () => {
  it('takes the first letter of each word, uppercased', () => {
    expect(deriveInitials('Truong Nam Nguyen')).toBe('TNN');
  });

  it('caps at three letters so a long name cannot overflow the avatar', () => {
    expect(deriveInitials('One Two Three Four Five')).toBe('OTT');
  });

  it('handles a single-word name', () => {
    expect(deriveInitials('Cher')).toBe('C');
  });

  it('ignores extra and surrounding whitespace', () => {
    expect(deriveInitials('  Truong   Nam  ')).toBe('TN');
  });

  it('returns an empty string for an empty name', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });

  it('keeps non-ASCII initials rather than skipping them', () => {
    expect(deriveInitials('Đặng Ánh')).toBe('ĐÁ');
  });
});
