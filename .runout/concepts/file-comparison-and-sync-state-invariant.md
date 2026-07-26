---
id: file-comparison-and-sync-state-invariant
title: File comparison and sync state invariant
blast_radius: 4
files:
  - tests/unit/lib/sync.test.ts
---

The `compareFiles` function must correctly determine whether files are in sync across source and target directories, treating missing files in both locations as in-sync. Violating this invariant causes false positives/negatives in sync operations, leading to unnecessary overwrites or missed updates, risking data loss or stale configurations.
