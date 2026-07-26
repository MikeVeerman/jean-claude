---
id: non-interactive-url-override-invariant
title: Non-interactive URL override invariant
blast_radius: 3
files:
  - tests/unit/lib/sync-setup.test.ts
---

When a remote URL is provided as an argument (`urlArg`), the system must skip interactive prompts and use the provided URL. Violating this invariant causes unexpected user prompts, breaking automation or scripts that rely on non-interactive setup. While not catastrophic, it disrupts workflows and may lead to incorrect remote configurations.
