---
id: global-error-handling-invariant
title: Global error handling invariant
blast_radius: 4
files:
  - src/cli.ts
---

All CLI errors must be caught and formatted consistently, with JeanClaudeError instances displaying user-friendly messages and suggestions. Uncaught errors risk exposing raw stack traces or crashing the process without clear recovery steps, leading to user confusion or data loss during sync operations.
