---
id: sync-push-pull-force-confirmation
title: Sync push/pull force confirmation
blast_radius: 5
files:
  - src/commands/sync.ts
---

Uncommitted local changes must be explicitly confirmed before being discarded during a pull operation. Failing to enforce this invariant risks silent data loss, as users may lose local configuration changes without realizing it, leading to irreversible config drift.
