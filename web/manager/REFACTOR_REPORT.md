# S12 CLI Manager UI Refactor Report

## Summary

- Added a small `src/lib/jobRequests.ts` helper for Jobs page API route construction and retry request body shaping.
- Updated `src/pages/Jobs.tsx` to use the helper and the shared `Job` type from `src/lib/types.ts`.
- Added Vitest characterization coverage for the extracted job request helper.
- Added manager-local `pnpm lint`, `pnpm typecheck`, and `pnpm test` scripts.

## Behavior Preservation

- Job list endpoint remains `/api/jobs?limit=50`.
- Job detail endpoint remains `/api/jobs/:id`.
- Job cancel endpoint remains `/api/jobs/:id/cancel`.
- Retry endpoints and request body fields remain unchanged for `run`, `publish`, and `record` jobs.
- Unknown runtime job types still produce the existing destructive toast path.

## Verification

- `pnpm typecheck` passed.
- `pnpm lint` passed. This manager package had no ESLint setup; the added lint script runs TypeScript diagnostics.
- `pnpm test` passed: 1 file, 5 tests.
- `pnpm build` passed.
- `git diff --check` passed.
- Manual smoke: started Vite with `pnpm dev --host 127.0.0.1`, opened `http://127.0.0.1:4301/jobs` in the in-app browser, and confirmed the Jobs screen rendered with the expected title/copy. API proxy errors were observed because the CLI API server was not running on `localhost:4300`.

## Review Notes

- code-review-graph `detect_changes` reported risk score `0.40` and no affected flows.
- Remaining test gap: React handler behavior in `Jobs.tsx` is not mounted in a component test. The new tests characterize the extracted pure request-building boundary only.
- Build emitted existing-style warnings for stale Browserslist data and a chunk over 500 kB; no build failure.

## Files Changed

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `src/lib/jobRequests.ts`
- `src/lib/jobRequests.test.ts`
- `src/pages/Jobs.tsx`
