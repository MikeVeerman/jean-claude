---
id: error-code-and-suggestion-propagation-invariant
title: Error code and suggestion propagation invariant
blast_radius: 3
files:
  - tests/unit/types/index.test.ts
---

All `JeanClaudeError` instances must propagate their `code` and optional `suggestion` to callers. Violating this invariant obscures the root cause of failures, making it harder for users or automation to recover. While not directly breaking functionality, it degrades the user experience and increases support burden.
