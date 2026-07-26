---
id: file-mapping-synchronization-integrity
title: File mapping synchronization integrity
blast_radius: 5
files:
  - src/lib/sync.ts
---

The FILE_MAPPINGS list defines which files and directories are synchronized between the Jean-Claude and Claude configurations. If this invariant is violated (e.g., by modifying the list without updating sync logic), critical configuration files may be silently omitted or overwritten, leading to broken agent behavior or data loss.
