import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { JeanClaudeError, ErrorCode } from '../../../src/types/index.js';

// Mock paths module before importing profiles
vi.mock('../../../src/lib/paths.js', () => ({
  getJeanClaudeDir: vi.fn(),
  getConfigPaths: vi.fn(),
}));

import {
  createProfile,
  loadProfiles,
  saveProfiles,
  getProfileConfigDir,
} from '../../../src/lib/profiles.js';
import * as paths from '../../../src/lib/paths.js';

describe('profiles.ts', () => {
  let tempDir: string;
  let jeanClaudeDir: string;
  let claudeConfigDir: string;
  let homedirSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-test-'));
    jeanClaudeDir = path.join(tempDir, '.jean-claude');
    claudeConfigDir = path.join(tempDir, '.claude');

    await fs.ensureDir(jeanClaudeDir);
    await fs.ensureDir(claudeConfigDir);

    // Redirect os.homedir() so getProfileConfigDir creates dirs inside tempDir
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(tempDir);

    vi.mocked(paths.getJeanClaudeDir).mockReturnValue(jeanClaudeDir);
    vi.mocked(paths.getConfigPaths).mockReturnValue({
      jeanClaudeDir,
      claudeConfigDir,
      platform: 'darwin',
    });
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.restoreAllMocks();
  });

  describe('createProfile — duplicate prevention', () => {
    it('should throw ALREADY_EXISTS when profile name is in the registry', async () => {
      await saveProfiles({
        profiles: {
          work: {
            alias: 'claude-work',
            configDir: path.join(tempDir, '.claude-work'),
          },
        },
      });

      await expect(createProfile('work')).rejects.toMatchObject({
        code: ErrorCode.ALREADY_EXISTS,
        message: expect.stringContaining('already exists'),
      });
    });

    it('should include profile name in registry-conflict error message', async () => {
      await saveProfiles({
        profiles: {
          personal: {
            alias: 'claude-personal',
            configDir: path.join(tempDir, '.claude-personal'),
          },
        },
      });

      try {
        await createProfile('personal');
        expect.fail('should have thrown');
      } catch (err) {
        const error = err as JeanClaudeError;
        expect(error.message).toContain('personal');
        expect(error.suggestion).toBeDefined();
      }
    });

    it('should throw ALREADY_EXISTS when profile directory exists on disk', async () => {
      await saveProfiles({ profiles: {} });

      const profileDir = getProfileConfigDir('orphan');
      await fs.ensureDir(profileDir);

      await expect(createProfile('orphan')).rejects.toMatchObject({
        code: ErrorCode.ALREADY_EXISTS,
        message: expect.stringContaining('already exists on disk'),
      });
    });

    it('should succeed when neither registry entry nor directory exists', async () => {
      await saveProfiles({ profiles: {} });

      const profile = await createProfile('fresh');

      expect(profile.alias).toBe('claude-fresh');
      expect(profile.configDir).toBe(getProfileConfigDir('fresh'));
      expect(await fs.pathExists(profile.configDir)).toBe(true);

      const config = await loadProfiles();
      expect(config.profiles['fresh']).toBeDefined();
    });

    it('should not create the directory when registry check fails', async () => {
      await saveProfiles({
        profiles: {
          dup: {
            alias: 'claude-dup',
            configDir: path.join(tempDir, '.claude-dup'),
          },
        },
      });

      const profileDir = getProfileConfigDir('dup');

      try {
        await createProfile('dup');
      } catch {
        // expected
      }

      expect(await fs.pathExists(profileDir)).toBe(false);
    });
  });
});
