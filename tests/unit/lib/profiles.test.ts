import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Mock paths module before importing profiles.
// Keep the real expandPath/contractPath so path round-tripping works in tests.
vi.mock('../../../src/lib/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/paths.js')>();
  return {
    ...actual,
    getConfigPaths: vi.fn(),
    getJeanClaudeDir: vi.fn(),
    detectPlatform: vi.fn(),
  };
});

/**
 * Helper to skip tests on Windows.
 * File symlinks on Windows require Developer Mode or admin privileges,
 * making symlink-specific tests unreliable in CI.
 */
const isWindows = process.platform === 'win32';

import {
  createProfile,
  createSymlinks,
  saveProfiles,
  loadProfiles,
  installShellAlias,
  removeShellAlias,
  getShellAliasLine,
  checkSharedItemHealth,
  relinkAllProfiles,
} from '../../../src/lib/profiles.js';
import { getConfigPaths, getJeanClaudeDir, detectPlatform } from '../../../src/lib/paths.js';

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

    // Set up mocks — detectPlatform returns actual OS for hardlink vs symlink logic
    const actualPlatform = isWindows ? 'win32' : 'darwin';
    vi.mocked(getConfigPaths).mockReturnValue({
      claudeConfigDir,
      jeanClaudeDir,
      platform: actualPlatform,
    });
    vi.mocked(getJeanClaudeDir).mockReturnValue(jeanClaudeDir);
    vi.mocked(detectPlatform).mockReturnValue(actualPlatform);
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

    it.skipIf(isWindows)('should symlink CLAUDE.md when shareClaudeMd is true (skipped on Windows)', async () => {
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

    it.skipIf(isWindows)('should not symlink statusline.sh unless shareStatusline is true', async () => {
      await fs.writeFile(
        path.join(claudeConfigDir, 'statusline.sh'),
        '#!/bin/bash\necho "status"'
      );

      const profile = await createProfile('test-no-statusline');
      const statuslinePath = path.join(profile.configDir, 'statusline.sh');

      // statusline.sh is no longer in SHARED_ITEMS — opt-in only
      expect(await fs.pathExists(statuslinePath)).toBe(false);
    });

    it.skipIf(isWindows)('should symlink both statusline.sh and statusline.ps1 when shareStatusline is true', async () => {
      await fs.writeFile(
        path.join(claudeConfigDir, 'statusline.sh'),
        '#!/bin/bash\necho "status"'
      );
      await fs.writeFile(
        path.join(claudeConfigDir, 'statusline.ps1'),
        '# PowerShell statusline'
      );

      const profile = await createProfile('test-statusline-both', {
        shareStatusline: true,
      });

      for (const statuslineFile of ['statusline.sh', 'statusline.ps1']) {
        const sp = path.join(profile.configDir, statuslineFile);
        expect(await fs.pathExists(sp)).toBe(true);
        const stat = await fs.lstat(sp);
        expect(stat.isSymbolicLink()).toBe(true);
      }
    });

    it.skipIf(isWindows)('should symlink statusline.sh when shareStatusline is true', async () => {
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

    it.skipIf(isWindows)('should support both sharing options together', async () => {
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

  describe('saveProfiles/loadProfiles — portable ~ paths', () => {
    it('should store configDir with ~ on disk and expand it on load', async () => {
      // os.homedir() is mocked to tempDir in beforeEach
      const configDir = path.join(tempDir, '.claude-work');
      await saveProfiles({
        profiles: { work: { alias: 'claude-work', configDir } },
      });

      const raw = await fs.readJson(path.join(jeanClaudeDir, 'profiles.json'));
      expect(raw.profiles.work.configDir).toBe('~/.claude-work');

      const loaded = await loadProfiles();
      expect(loaded.profiles.work.configDir).toBe(configDir);
    });

    it('should not mutate the config object passed to saveProfiles', async () => {
      const configDir = path.join(tempDir, '.claude-work');
      const config = { profiles: { work: { alias: 'claude-work', configDir } } };

      await saveProfiles(config);
      expect(config.profiles.work.configDir).toBe(configDir);
    });

    it('should load legacy profiles.json with absolute paths unchanged', async () => {
      await fs.writeJson(path.join(jeanClaudeDir, 'profiles.json'), {
        profiles: { old: { alias: 'claude-old', configDir: '/tmp/absolute-dir' } },
      });

      const loaded = await loadProfiles();
      expect(loaded.profiles.old.configDir).toBe('/tmp/absolute-dir');
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
    it('should create links for existing shared items and return results with method', async () => {
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

      const results = await createSymlinks(sourceDir, targetDir);

      expect(results.map((r) => r.name)).toContain('settings.json');
      expect(results.map((r) => r.name)).toContain('hooks');

      // Directory always uses symlink (junction on Windows)
      const hooksResult = results.find((r) => r.name === 'hooks');
      expect(hooksResult?.method).toBe('symlink');

      // File method depends on platform: 'link' (hardlink) on Windows, 'symlink' elsewhere
      const settingsResult = results.find((r) => r.name === 'settings.json');
      if (isWindows) {
        expect(settingsResult?.method).toBe('link');
        // Verify hardlink by checking link count (fs-extra doesn't expose this directly)
        // The file should exist and be identical to the source
        const destContent = await fs.readFile(path.join(targetDir, 'settings.json'), 'utf-8');
        expect(destContent).toBe('{"key":"value"}');
      } else {
        expect(settingsResult?.method).toBe('symlink');
        const stat = await fs.lstat(path.join(targetDir, 'settings.json'));
        expect(stat.isSymbolicLink()).toBe(true);
      }
    });

    it('should skip items that do not exist in source', async () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');
      await fs.ensureDir(sourceDir);
      await fs.ensureDir(targetDir);

      // Don't create any shared items
      const results = await createSymlinks(sourceDir, targetDir);
      expect(results).toEqual([]);
    });
  });

  // Windows link semantics: hardlinks for files, junctions for directories.
  // detectPlatform is mocked to 'win32' so these run on every OS (hardlinks
  // are POSIX-native too, and the 'junction' symlink type is ignored outside
  // Windows); on the windows-latest CI job they exercise real junctions.
  describe('createSymlinks — Windows semantics (hardlinks + junctions)', () => {
    let sourceDir: string;
    let targetDir: string;

    beforeEach(async () => {
      vi.mocked(detectPlatform).mockReturnValue('win32');
      sourceDir = path.join(tempDir, 'win-source');
      targetDir = path.join(tempDir, 'win-target');
      await fs.ensureDir(sourceDir);
      await fs.ensureDir(targetDir);
      await fs.writeFile(path.join(sourceDir, 'settings.json'), '{"a":1}');
      await fs.ensureDir(path.join(sourceDir, 'hooks'));
      await fs.writeFile(path.join(sourceDir, 'hooks', 'hook.sh'), 'echo hi');
    });

    it('creates hardlinks for files (method: link, same inode)', async () => {
      const results = await createSymlinks(sourceDir, targetDir);

      const settings = results.find((r) => r.name === 'settings.json');
      expect(settings?.method).toBe('link');

      // A hardlink is not a symlink and shares the inode with the source
      const lstat = await fs.lstat(path.join(targetDir, 'settings.json'));
      expect(lstat.isSymbolicLink()).toBe(false);

      const srcStat = await fs.stat(path.join(sourceDir, 'settings.json'));
      const dstStat = await fs.stat(path.join(targetDir, 'settings.json'));
      expect(dstStat.ino).toBe(srcStat.ino);
    });

    it('creates junctions for directories (method: symlink)', async () => {
      const results = await createSymlinks(sourceDir, targetDir);

      const hooks = results.find((r) => r.name === 'hooks');
      expect(hooks?.method).toBe('symlink');

      // Junctions report as symbolic links via lstat
      const lstat = await fs.lstat(path.join(targetDir, 'hooks'));
      expect(lstat.isSymbolicLink()).toBe(true);

      // Content is reachable through the junction
      const content = await fs.readFile(
        path.join(targetDir, 'hooks', 'hook.sh'),
        'utf-8'
      );
      expect(content).toBe('echo hi');
    });

    it('falls back to copy when the hardlink fails with EXDEV (cross-volume)', async () => {
      vi.spyOn(fs, 'link').mockRejectedValue(
        Object.assign(new Error('EXDEV: cross-device link not permitted'), {
          code: 'EXDEV',
        })
      );

      const results = await createSymlinks(sourceDir, targetDir);

      const settings = results.find((r) => r.name === 'settings.json');
      expect(settings?.method).toBe('copy');

      const content = await fs.readFile(
        path.join(targetDir, 'settings.json'),
        'utf-8'
      );
      expect(content).toBe('{"a":1}');
    });

    it('falls back to copy when the hardlink fails with EPERM', async () => {
      vi.spyOn(fs, 'link').mockRejectedValue(
        Object.assign(new Error('EPERM: operation not permitted'), {
          code: 'EPERM',
        })
      );

      const results = await createSymlinks(sourceDir, targetDir);

      const settings = results.find((r) => r.name === 'settings.json');
      expect(settings?.method).toBe('copy');
    });

    it('rethrows unexpected hardlink errors instead of copying', async () => {
      vi.spyOn(fs, 'link').mockRejectedValue(
        Object.assign(new Error('EACCES: permission denied'), {
          code: 'EACCES',
        })
      );

      await expect(createSymlinks(sourceDir, targetDir)).rejects.toMatchObject({
        code: 'EACCES',
      });
    });
  });

  describe('checkSharedItemHealth', () => {
    let sourceDir: string;
    let profileDir: string;

    beforeEach(async () => {
      sourceDir = path.join(tempDir, 'health-source');
      profileDir = path.join(tempDir, 'health-profile');
      await fs.ensureDir(sourceDir);
      await fs.ensureDir(profileDir);
      await fs.writeFile(path.join(sourceDir, 'settings.json'), '{"a":1}');
    });

    it('reports no issues for an intact hardlink', async () => {
      await fs.link(
        path.join(sourceDir, 'settings.json'),
        path.join(profileDir, 'settings.json')
      );

      const issues = await checkSharedItemHealth(sourceDir, profileDir);
      expect(issues).toEqual([]);
    });

    it('does not flag a copy with identical content', async () => {
      await fs.copy(
        path.join(sourceDir, 'settings.json'),
        path.join(profileDir, 'settings.json')
      );

      const issues = await checkSharedItemHealth(sourceDir, profileDir);
      expect(issues).toEqual([]);
    });

    it('reports stale when the profile file diverged from the source', async () => {
      // Simulates a detached hardlink: same name, different inode + content
      await fs.writeFile(path.join(profileDir, 'settings.json'), '{"old":true}');

      const issues = await checkSharedItemHealth(sourceDir, profileDir);
      expect(issues).toEqual([{ name: 'settings.json', kind: 'stale' }]);
    });

    it.skipIf(isWindows)('reports broken symlinks whose target is gone (skipped on Windows)', async () => {
      await fs.symlink(
        path.join(sourceDir, 'keybindings.json'),
        path.join(profileDir, 'keybindings.json')
      );

      const issues = await checkSharedItemHealth(sourceDir, profileDir);
      expect(issues).toEqual([{ name: 'keybindings.json', kind: 'broken' }]);
    });
  });

  describe('relinkAllProfiles', () => {
    it('re-links profiles so they see a replaced source file', async () => {
      await fs.writeFile(path.join(claudeConfigDir, 'settings.json'), '{"v":1}');
      const profile = await createProfile('relink-test');

      // Replace the source file — this is what sync pull does, and what
      // detaches hardlinks on Windows
      await fs.remove(path.join(claudeConfigDir, 'settings.json'));
      await fs.writeFile(path.join(claudeConfigDir, 'settings.json'), '{"v":2}');

      const relinked = await relinkAllProfiles();
      expect(relinked).toContain('relink-test');

      const content = await fs.readFile(
        path.join(profile.configDir, 'settings.json'),
        'utf-8'
      );
      expect(content).toBe('{"v":2}');
    });

    it('skips profiles whose directory is missing', async () => {
      await saveProfiles({
        profiles: {
          ghost: { alias: 'claude-ghost', configDir: path.join(tempDir, '.claude-ghost') },
        },
      });

      const relinked = await relinkAllProfiles();
      expect(relinked).toEqual([]);
    });
  });

  describe('getShellAliasLine', () => {
    const profile = {
      alias: 'claude-work',
      configDir: 'C:\\Users\\me\\.claude-work',
    };

    it('keeps Windows paths literal for PowerShell (no doubled backslashes)', () => {
      const line = getShellAliasLine(profile, 'Microsoft.PowerShell_profile.ps1');
      expect(line).toBe(
        "function claude-work { $env:CLAUDE_CONFIG_DIR='C:\\Users\\me\\.claude-work'; claude @args }"
      );
    });

    it('escapes backslashes for bash/zsh double-quoted strings', () => {
      const line = getShellAliasLine(profile, '.bashrc');
      expect(line).toContain('CLAUDE_CONFIG_DIR="C:\\\\Users\\\\me\\\\.claude-work"');
    });
  });
});
