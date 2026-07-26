---
id: metadata-consistency-and-persistence-invariant
title: Metadata consistency and persistence invariant
blast_radius: 4
files:
  - tests/unit/lib/sync.test.ts
---

The `meta.json` file must accurately reflect the system's state, including `managedBy`, `lastSync`, and `claudeConfigPath`. If this invariant is violated, the system may misidentify repos as unmanaged or fail to track sync times, leading to incorrect sync behavior or skipped updates. Corrupted metadata can cause silent failures in sync operations.
