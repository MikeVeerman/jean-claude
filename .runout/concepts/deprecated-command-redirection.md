---
id: deprecated-command-redirection
title: Deprecated command redirection
blast_radius: 3
files:
  - src/commands/pull.ts
  - src/commands/push.ts
  - src/commands/status.ts
---

Deprecated commands (pull, push, status) must redirect to their sync counterparts with a warning message. Misunderstanding this invariant could lead to engineers wasting time debugging deprecated paths or missing critical sync behavior changes, causing config drift across machines.
