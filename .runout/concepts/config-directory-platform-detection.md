---
id: config-directory-platform-detection
title: Config directory platform detection
blast_radius: 3
files:
  - src/lib/paths.ts
---

The configuration directory must be detected based on platform-specific rules (XDG on Linux, ~/.claude on macOS). Misunderstanding this invariant could lead to incorrect config file locations, causing the tool to fail silently or create duplicate configs, resulting in inconsistent behavior across machines.
