import { describe, expect, it } from 'vitest';
import {
  isOneOf,
  LAYOUT_ALIGN_OPTIONS,
  LAYOUT_ALIGNS,
  LAYOUT_COLUMN_OPTIONS,
  LAYOUT_COLUMNS,
  LAYOUT_DIRECTION_OPTIONS,
  LAYOUT_DIRECTIONS,
  LAYOUT_JUSTIFIES,
  LAYOUT_JUSTIFY_OPTIONS,
  LAYOUT_SPACING_OPTIONS,
  LAYOUT_SPACINGS,
  LAYOUT_SURFACE_OPTIONS,
  LAYOUT_SURFACES,
  VIDEO_MODE_OPTIONS,
  VIDEO_MODES,
} from './layoutOptions';

// Every dropdown the editor shows must offer exactly the values the save
// guard accepts. A value in one but not the other is either a save that
// fails with a confusing error, or a stored value the CSS has no rule for.
const PAIRS: [readonly string[], readonly { value: string }[]][] = [
  [LAYOUT_DIRECTIONS, LAYOUT_DIRECTION_OPTIONS],
  [LAYOUT_SPACINGS, LAYOUT_SPACING_OPTIONS],
  [LAYOUT_ALIGNS, LAYOUT_ALIGN_OPTIONS],
  [LAYOUT_JUSTIFIES, LAYOUT_JUSTIFY_OPTIONS],
  [LAYOUT_COLUMNS, LAYOUT_COLUMN_OPTIONS],
  [LAYOUT_SURFACES, LAYOUT_SURFACE_OPTIONS],
  [VIDEO_MODES, VIDEO_MODE_OPTIONS],
];

describe('layoutOptions', () => {
  it('offers exactly the allowed values in every option list', () => {
    for (const [values, options] of PAIRS) {
      expect(options.map((o) => o.value)).toEqual([...values]);
    }
  });

  it('gives every option a non-empty label', () => {
    for (const [, options] of PAIRS) {
      for (const option of options) {
        expect(
          (option as unknown as { label: string }).label.length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('narrows known values and rejects unknown ones', () => {
    expect(isOneOf(LAYOUT_DIRECTIONS, 'grid')).toBe(true);
    expect(isOneOf(LAYOUT_DIRECTIONS, 'flex')).toBe(false);
    expect(isOneOf(LAYOUT_DIRECTIONS, 3)).toBe(false);
    expect(isOneOf(LAYOUT_SURFACES, undefined)).toBe(false);
  });
});
