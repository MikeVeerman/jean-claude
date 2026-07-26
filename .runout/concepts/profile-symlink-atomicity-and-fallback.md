---
id: profile-symlink-atomicity-and-fallback
title: Profile symlink atomicity and fallback
blast_radius: 3
files:
  - tests/unit/lib/profiles.test.ts
---

Profile creation must atomically create symlinks for shared items (e.g., CLAUDE.md) and fall back to independent files if the source does not exist. Misunderstanding this can cause broken symlinks or missing files, leading to inconsistent agent behavior across profiles.
