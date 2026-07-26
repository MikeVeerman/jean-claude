---
id: shared-profile-items-configuration
title: Shared profile items configuration
blast_radius: 3
files:
  - tests/unit/lib/profiles.test.ts
---

The SHARED_ITEMS list defines which configuration files can be symlinked across profiles. If this invariant is violated (e.g., by adding a file that should not be shared), sensitive configuration may leak between profiles, causing security or functional issues.
