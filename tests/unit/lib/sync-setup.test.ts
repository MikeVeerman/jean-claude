import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { JeanClaudeError, ErrorCode } from '../../../src/types/index.js';

// Mock prompts module
vi.mock('../../../src/utils/prompts.js', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}));

// Mock git module — keep real implementations for initRepo/addRemote/isGitRepo/createGit
vi.mock('../../../src/lib/git.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/git.js')>();
  return {
    ...actual,
    testRemoteConnection: vi.fn(),
    cloneRepo: vi.fn(),
  };
});

// Mock sync module (readMetaJson)
vi.mock('../../../src/lib/sync.js', () => ({
  readMetaJson: vi.fn(),
}));

// Mock logger to suppress output
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    success: vi.fn(),
    dim: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { setupGitSync } from '../../../src/lib/sync-setup.js';
import { input, confirm } from '../../../src/utils/prompts.js';
import { testRemoteConnection, cloneRepo } from '../../../src/lib/git.js';
import { readMetaJson } from '../../../src/lib/sync.js';

describe('sync-setup.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-setup-test-'));
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('#35 — Clone fallback when CLONE_FAILED', () => {
    it('should fall back to initRepo + addRemote when cloneRepo throws CLONE_FAILED', async () => {
      // Empty directory, not a git repo
      vi.mocked(testRemoteConnection).mockResolvedValue(true);
      vi.mocked(cloneRepo).mockRejectedValue(
        new JeanClaudeError('fail', ErrorCode.CLONE_FAILED)
      );

      await setupGitSync(tempDir, 'https://example.com/repo.git');

      // Should be a git repo with a remote now
      const git = simpleGit(tempDir);
      const isRepo = await git.checkIsRepo();
      expect(isRepo).toBe(true);

      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      expect(origin).toBeDefined();
      expect(origin!.refs.fetch).toBe('https://example.com/repo.git');
    });
  });

  describe('#35 — Validation error (INVALID_CONFIG) is re-thrown', () => {
    it('should re-throw INVALID_CONFIG from warnIfNotJeanClaudeRepo', async () => {
      // Empty directory, not a git repo
      vi.mocked(testRemoteConnection).mockResolvedValue(true);
      // cloneRepo succeeds (no error)
      vi.mocked(cloneRepo).mockResolvedValue(undefined);
      // readMetaJson returns null (no managedBy field)
      vi.mocked(readMetaJson).mockResolvedValue(null);
      // User declines the confirm prompt
      vi.mocked(confirm).mockResolvedValue(false);

      await expect(
        setupGitSync(tempDir, 'https://example.com/repo.git')
      ).rejects.toThrow(JeanClaudeError);

      await expect(
        setupGitSync(tempDir, 'https://example.com/repo.git')
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CONFIG });
    });
  });

  describe('#19 — Reconfigure existing remote', () => {
    it('should update remote URL when urlArg is provided and different', async () => {
      // Set up a real local git repo with a remote
      const git = simpleGit(tempDir);
      await git.init();
      await git.addRemote('origin', 'https://old-url.com/repo.git');

      await setupGitSync(tempDir, 'https://new-url.com/repo.git');

      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      expect(origin).toBeDefined();
      expect(origin!.refs.fetch).toBe('https://new-url.com/repo.git');
    });
  });

  describe('#19 — Existing remote without urlArg returns immediately', () => {
    it('should return without prompting when remote exists and no urlArg', async () => {
      // Set up a real local git repo with a remote
      const git = simpleGit(tempDir);
      await git.init();
      await git.addRemote('origin', 'https://existing.com/repo.git');

      await setupGitSync(tempDir);

      // Should not have called input (no prompt)
      expect(input).not.toHaveBeenCalled();
      // Remote should be unchanged
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      expect(origin!.refs.fetch).toBe('https://existing.com/repo.git');
    });
  });

  describe('#31 — urlArg skips interactive prompt', () => {
    it('should not call input() when urlArg is provided', async () => {
      vi.mocked(testRemoteConnection).mockResolvedValue(true);
      vi.mocked(cloneRepo).mockRejectedValue(
        new JeanClaudeError('fail', ErrorCode.CLONE_FAILED)
      );

      await setupGitSync(tempDir, 'https://example.com/repo.git');

      expect(input).not.toHaveBeenCalled();
    });
  });
});
