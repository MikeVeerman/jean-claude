---
id: profile-registry-atomic-updates
title: Profile registry atomic updates
blast_radius: 4
files:
  - src/lib/profiles.ts
---

Profile registry updates (profiles.json) must be atomic, using a temporary file and rename operation. Failing to enforce this invariant risks corrupting the registry during concurrent operations, leading to lost profiles or broken symlinks, and requiring manual recovery.
