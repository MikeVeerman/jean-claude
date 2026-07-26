---
id: git-pull-rebase-before-push-atomicity
title: Git pull-rebase before push atomicity
blast_radius: 5
files:
  - tests/unit/lib/git.test.ts
---

The commitAndPush function must atomically pull with rebase before pushing to avoid overwriting remote changes. If this invariant is violated, concurrent syncs across machines can cause silent data loss or merge conflicts that corrupt the configuration repository.
