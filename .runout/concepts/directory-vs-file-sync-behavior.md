---
id: directory-vs-file-sync-behavior
title: Directory vs file sync behavior
blast_radius: 4
files:
  - src/lib/sync.ts
---

Directories in FILE_MAPPINGS are synchronized recursively, while files are copied atomically. Misunderstanding this can cause partial syncs where directory contents are not fully updated, leading to inconsistent agent behavior or missing hooks/skills.
