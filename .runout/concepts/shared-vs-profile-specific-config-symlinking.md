---
id: shared-vs-profile-specific-config-symlinking
title: Shared vs. profile-specific config symlinking
blast_radius: 4
files:
  - src/lib/profiles.ts
---

Shared configuration items (e.g., settings.json, hooks) must be symlinked from the main config directory, while profile-specific files (e.g., CLAUDE.md) must remain independent unless explicitly shared. Misunderstanding this invariant could lead to unintended config leakage between profiles or broken symlinks, causing runtime errors or incorrect behavior.
