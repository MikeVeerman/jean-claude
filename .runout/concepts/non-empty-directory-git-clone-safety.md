---
id: non-empty-directory-git-clone-safety
title: Non-empty directory git clone safety
blast_radius: 4
files:
  - src/lib/sync-setup.ts
---

When cloning into a non-empty directory, the system must atomically move the .git directory from a temporary clone to avoid partial state. If this fails, the local directory may end up with a corrupted git repository, causing sync operations to fail or overwrite user data unexpectedly.
