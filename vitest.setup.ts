import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Vitest is configured without `globals: true`, so React Testing Library's
// automatic per-test cleanup never registers itself. Without this, every
// render in a file accumulates in document.body and any `screen.*` query
// can match an element left behind by an earlier test — which is why some
// suites in this repo query through `within(container)` instead. Registering
// cleanup once here makes `screen` safe everywhere and keeps the two styles
// from drifting apart.
afterEach(cleanup);
