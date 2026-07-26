---
id: repository-origin-as-single-source-of-truth
title: Repository origin as single source of truth
blast_radius: 5
files:
  - src/lib/sync-setup.ts
---

The remote repository URL configured as 'origin' is treated as the single source of truth for configuration. If this invariant is violated (e.g., by manually changing the remote), sync operations may pull or push to the wrong repository, causing silent data loss or corruption of the user's Claude configuration across machines.
