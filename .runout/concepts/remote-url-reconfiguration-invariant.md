---
id: remote-url-reconfiguration-invariant
title: Remote URL reconfiguration invariant
blast_radius: 3
files:
  - tests/unit/lib/sync-setup.test.ts
---

If a Git remote already exists and a new URL is provided, the system must update the remote URL to the new value. If this invariant is violated, the remote remains stale, causing syncs to push/pull from the wrong repository. This can lead to divergence or loss of work, though conflicts are typically detectable during Git operations.
