---
id: profile-directory-creation-race-condition
title: Profile directory creation race condition
blast_radius: 4
files:
  - src/lib/profiles.ts
---

Profile directories must be created atomically to avoid TOCTOU (time-of-check-to-time-of-use) race conditions. Failing to enforce this invariant could result in duplicate profile directories or symlink creation failures, causing inconsistent profile states and potential data corruption during sync.
