---
id: repo-validation-and-user-consent-invariant
title: Repo validation and user consent invariant
blast_radius: 5
files:
  - tests/unit/lib/sync-setup.test.ts
---

Before proceeding with sync setup, the system must validate that the target repo is managed by Jean-Claude (via `managedBy` field in `meta.json`). If validation fails, the user must explicitly consent to proceed; otherwise, the setup throws `INVALID_CONFIG`. Misunderstanding this invariant risks syncing into an unintended repo, causing silent data corruption or overwriting unrelated files.
