---
id: machine-id-generation-consistency-invariant
title: Machine ID generation consistency invariant
blast_radius: 3
files:
  - tests/unit/lib/sync.test.ts
---

The `machineId` in `meta.json` must be generated consistently for the same hostname and platform. If this invariant is violated, the system may treat the same machine as multiple entities, causing redundant syncs or conflicts. While not immediately catastrophic, it degrades performance and complicates debugging.
