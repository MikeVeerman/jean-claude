---
id: git-sync-atomicity-and-conflict-resolution
title: Git sync atomicity and conflict resolution
blast_radius: 5
files:
  - src/lib/git.ts
---

Git operations must be atomic and handle meta.json conflicts by preferring 'ours' version during rebase. Misunderstanding this invariant risks corrupting the meta.json file, leading to silent data loss or sync failures across all machines, as meta.json tracks the canonical state of the configuration.
