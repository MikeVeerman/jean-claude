---
id: clone-fallback-on-failure-invariant
title: Clone fallback on failure invariant
blast_radius: 4
files:
  - tests/unit/lib/sync-setup.test.ts
---

When `cloneRepo` fails with `CLONE_FAILED`, the system must fall back to initializing a new Git repo and adding the remote manually. If this invariant is violated, the sync setup fails entirely, leaving the directory in an uninitialized state, which breaks the entire onboarding flow. The fallback is critical for resilience against transient network or permission issues during the initial clone.
