import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminAuthBypassed } from './adminAccess';

// NODE_ENV is readonly in the type definitions but writable at runtime;
// vi.stubEnv handles both and is undone by unstubAllEnvs below.
function setEnv(nodeEnv: string, flag: string | undefined) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('DISABLE_ADMIN_AUTH', flag as string);
}

describe('isAdminAuthBypassed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bypasses auth when the flag is set outside production', () => {
    setEnv('development', 'true');
    expect(isAdminAuthBypassed()).toBe(true);
  });

  it('refuses to bypass in production even with the flag set', () => {
    setEnv('production', 'true');
    expect(isAdminAuthBypassed()).toBe(false);
  });

  it('does not bypass on NODE_ENV alone, so the test suite stays gated', () => {
    // Guards the trap this flag was designed around: vitest itself runs with
    // NODE_ENV=test, so a NODE_ENV-only check would silently disable auth in
    // this repo's own tests and make the "Not authorized." assertions in
    // app/admin/actions.test.ts pass vacuously.
    setEnv('test', undefined);
    expect(isAdminAuthBypassed()).toBe(false);
    setEnv('development', undefined);
    expect(isAdminAuthBypassed()).toBe(false);
  });

  it('requires the exact string "true", not any truthy value', () => {
    setEnv('development', '1');
    expect(isAdminAuthBypassed()).toBe(false);
    setEnv('development', 'yes');
    expect(isAdminAuthBypassed()).toBe(false);
    setEnv('development', 'false');
    expect(isAdminAuthBypassed()).toBe(false);
  });
});
