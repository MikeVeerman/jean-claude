---
id: error-code-specificity-for-recovery
title: Error code specificity for recovery
blast_radius: 3
files:
  - src/types/index.ts
---

JeanClaudeError codes must precisely indicate the failure mode (e.g., NETWORK_ERROR vs INVALID_CONFIG) to enable correct recovery logic. Misusing error codes can lead to inappropriate retries or misleading user guidance, causing repeated failures or data corruption during sync operations.
