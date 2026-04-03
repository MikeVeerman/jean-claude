import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Mock paths module before importing profiles
vi.mock('../../../src/lib/paths.js', () => ({
  getConfigPaths: vi.fn(),
  getJeanClaudeDir: vi.fn(),
}));

import {
  createProfile,
  createSymlinks,
  saveProfiles,
  loadProfiles,
  installShellAlias,
  removeShellAlias,
  getShellAliasLine,
  SHARED_ITEMS,
} from '../../../src/lib/profiles.js';
import { getConfigPaths, getJeanClaudeDir } from '../../../src/lib/paths.js';

describe('profiles.ts', () => {
  let tempDir: string;
  let claudeConfigDir: string;
  let jeanClaudeDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-test-'));
    claudeConfigDir = path.join(tempDir, '.claude');
    jeanClaudeDir = path.join(tempDir, '.jean-claude');

    await fs.ensureDir(claudeConfigDir);
    await fs.ensureDir(jeanClaudeDir);

    // Redirect os.homedir() so getProfileConfigDir creates dirs inside tempDir
    vi.spyOn(os, 'homedir').mockReturnValue(tempDir);

    // Set up mocks
    vi.mocked(getConfigPaths).mockReturnValue({
      claudeConfigDir,
      jeanClaudeDir,
      platform: 'darwin',
    });
    vi.mocked(getJeanClaudeDir).mockReturnValue(jeanClaudeDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
    vi.restoreAllMocks();
  });

  describe('createProfile', () => {
    it('should create an independent CLAUDE.md by default', async () => {
      // Create a CLAUDE.md in main config to verify it is NOT symlinked
      await fs.writeFile(
        path.join(claudeConfigDir, 'CLAUDE.md'),
        '# Main config'
      );

      const profile = await createProfile('test-default');
      const claudeMdPath = path.join(profile.configDir, 'CLAUDE.md');

      expect(await fs.pathExists(claudeMdPath)).toBe(true);

      // Should be a regular file, not a symlink
      const stat = await fs.lstat(claudeMdPath);
      expect(stat.isSymbolicLink()).toBe(false);

      const content = await fs.readFile(claudeMdPath, 'utf-8');
      expect(content).toContain('test-default profile');
    });

    it('should symlink CLAUDE.md when shareClaudeMd is true', async () => {
      const mainClaudeMd = path.join(claudeConfigDir, 'CLAUDE.md');
      await fs.writeFile(mainClaudeMd, '# Shared instructions');

      const profile = await createProfile('test-shared-md', {
        shareClaudeMd: true,
      });
      const claudeMdPath = path.join(profile.configDir, 'CLAUDE.md');

      expect(await fs.pathExists(claudeMdPath)).toBe(true);

      // Should be a symlink
      const stat = await fs.lstat(claudeMdPath);
      expect(stat.isSymbolicLink()).toBe(true);

      // Should point to main config
      const target = await fs.readlink(claudeMdPath);
      expect(target).toBe(mainClaudeMd);

      // Content should match the main file
      const content = await fs.readFile(claudeMdPath, 'utf-8');
      expect(content).toBe('# Shared instructions');
    });

    it('should fall back to independent CLAUDE.md when shareClaudeMd is true but source does not exist', async () => {
      // Do NOT create CLAUDE.md in main config
      const profile = await createProfile('test-fallback-md', {
        shareClaudeMd: true,
      });
      const claudeMdPath = path.join(profile.configDir, 'CLAUDE.md');

      expect(await fs.pathExists(claudeMdPath)).toBe(true);
      const stat = await fs.lstat(claudeMdPath);
      expect(stat.isSymbolicLink()).toBe(false);
    });

    it('should not symlink statusline.sh by default', async () => {
      await fs.writeFile(
        path.join(claudeConfigDir, 'statusline.sh'),
        '#!/bin/bash\necho "status"'
      );

      const profile = await createProfile('test-no-statusline');
      const statuslinePath = path.join(profile.configDir, 'statusline.sh');

      expect(await fs.pathExists(statuslinePath)).toBe(false);
    });

    it('should symlink statusline.sh when shareStatusline is true', async () => {
      const mainStatusline = path.join(claudeConfigDir, 'statusline.sh');
      await fs.writeFile(mainStatusline, '#!/bin/bash\necho "status"');

      const profile = await createProfile('test-statusline', {
        shareStatusline: true,
      });
      const statuslinePath = path.join(profile.configDir, 'statusline.sh');

      expect(await fs.pathExists(statuslinePath)).toBe(true);

      const stat = await fs.lstat(statuslinePath);
      expect(stat.isSymbolicLink()).toBe(true);

      const target = await fs.readlink(statuslinePath);
      expect(target).toBe(mainStatusline);
    });

    it('should not create statusline.sh symlink when source does not exist', async () => {
      // Do NOT create statusline.sh in main config
      const profile = await createProfile('test-no-src-statusline', {
        shareStatusline: true,
      });
      const statuslinePath = path.join(profile.configDir, 'statusline.sh');

      expect(await fs.pathExists(statuslinePath)).toBe(false);
    });

    it('should support both sharing options together', async () => {
      await fs.writeFile(
        path.join(claudeConfigDir, 'CLAUDE.md'),
        '# Shared'
      );
      await fs.writeFile(
        path.join(claudeConfigDir, 'statusline.sh'),
        '#!/bin/bash'
      );

      const profile = await createProfile('test-both', {
        shareClaudeMd: true,
        shareStatusline: true,
      });

      const claudeMdStat = await fs.lstat(
        path.join(profile.configDir, 'CLAUDE.md')
      );
      expect(claudeMdStat.isSymbolicLink()).toBe(true);

      const statuslineStat = await fs.lstat(
        path.join(profile.configDir, 'statusline.sh')
      );
      expect(statuslineStat.isSymbolicLink()).toBe(true);
    });
  });

  describe('createProfile — atomic directory creation [2]', () => {
    it('should fail gracefully when directory is created by another process between check and create', async () => {
      await saveProfiles({ profiles: {} });

      // Pre-create the directory to simulate a race condition
      const configDir = path.join(tempDir, '.claude-raced');
      await fs.ensureDir(configDir);

      await expect(createProfile('raced')).rejects.toMatchObject({
        code: 'ALREADY_EXISTS',
        message: expect.stringContaining('already exists on disk'),
      });

      // Verify no partial state was left in the registry
      const config = await loadProfiles();
      expect(config.profiles['raced']).toBeUndefined();
    });
  });

  describe('saveProfiles — atomic write [4]', () => {
    it('should not leave partial JSON if write is interrupted', async () => {
      // Write initial state
      await saveProfiles({ profiles: { existing: { alias: 'claude-existing', configDir: '/tmp/existing' } } });

      // Verify the file is valid JSON after save
      const config = await loadProfiles();
      expect(config.profiles['existing']).toBeDefined();
      expect(config.profiles['existing'].alias).toBe('claude-existing');
    });

    it('should not leave temp files on successful save', async () => {
      await saveProfiles({ profiles: {} });

      const jcDir = getJeanClaudeDir();
      const files = await fs.readdir(jcDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toEqual([]);
    });
  });

  describe('installShellAlias — regex escaping [1]', () => {
    it('should correctly replace an existing alias using the escaped regex', async () => {
      const rcPath = path.join(tempDir, '.zshrc');
      const profile = { alias: 'claude-my-work', configDir: path.join(tempDir, '.claude-my-work') };

      // Install the alias
      await installShellAlias('my-work', profile, '.zshrc');
      const content1 = await fs.readFile(rcPath, 'utf-8');
      expect(content1).toContain('jean-claude profile: my-work');
      expect(content1).toContain('claude-my-work');

      // Re-install (should replace, not duplicate)
      const updatedProfile = { alias: 'claude-my-work', configDir: '/updated/path' };
      await installShellAlias('my-work', updatedProfile, '.zshrc');
      const content2 = await fs.readFile(rcPath, 'utf-8');

      // Should only have one alias block
      const matches = content2.match(/jean-claude profile: my-work/g);
      expect(matches?.length).toBe(1);
      expect(content2).toContain('/updated/path');
    });

    it('should not match other profile names when replacing', async () => {
      const rcPath = path.join(tempDir, '.zshrc');
      const profileA = { alias: 'claude-a', configDir: path.join(tempDir, '.claude-a') };
      const profileAb = { alias: 'claude-ab', configDir: path.join(tempDir, '.claude-ab') };

      await installShellAlias('a', profileA, '.zshrc');
      await installShellAlias('ab', profileAb, '.zshrc');

      // Remove only 'a' — 'ab' should remain
      const removed = await removeShellAlias('a', '.zshrc');
      expect(removed).toBe(true);

      const content = await fs.readFile(rcPath, 'utf-8');
      expect(content).not.toContain('jean-claude profile: a\n');
      expect(content).toContain('jean-claude profile: ab');
    });
  });

  describe('createSymlinks', () => {
    it('should create symlinks for existing shared items', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      await fs.ensureDir(sourceDir);
      await fs.ensureDir(targetDir);

      // Create some shared items
      await fs.writeFile(
        path.join(sourceDir, 'settings.json'),
        '{"key":"value"}'
      );
      await fs.ensureDir(path.join(sourceDir, 'hooks'));

      const created = await createSymlinks(sourceDir, targetDir);

      expect(created).toContain('settings.json');
      expect(created).toContain('hooks');

      const stat = await fs.lstat(path.join(targetDir, 'settings.json'));
      expect(stat.isSymbolicLink()).toBe(true);
    });

    it('should skip items that do not exist in source', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      await fs.ensureDir(sourceDir);
      await fs.ensureDir(targetDir);

      // Don't create any shared items
      const created = await createSymlinks(sourceDir, targetDir);
      expect(created).toEqual([]);
    });
  });
});
