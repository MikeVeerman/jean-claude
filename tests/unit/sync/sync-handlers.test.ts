import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  handleSyncPush,
  handleSyncPull,
  handleSyncStatus,
} from '../../../src/commands/sync.js';
import * as paths from '../../../src/lib/paths.js';
import * as prompts from '../../../src/utils/prompts.js';
import * as logger from '../../../src/utils/logger.js';
import * as git from '../../../src/lib/git.js';
import * as sync from '../../../src/lib/sync.js';
import { JeanClaudeError, ErrorCode } from '../../../src/types/index.js';

vi.mock('fs-extra', () => {
  const mock = {
    existsSync: vi.fn(),
    mkdtemp: vi.fn(async (prefix) => prefix + '-tmpdir'),
    remove: vi.fn(),
  };
  return {
    default: mock,
    ...mock,
  };
});

vi.mock('../../../src/lib/paths.js', () => ({
  getConfigPaths: vi.fn(),
  detectPlatform: vi.fn(() => 'darwin'),
  contractPath: vi.fn((p) => p),
}));

vi.mock('../../../src/lib/git.js', () => ({
  isGitRepo: vi.fn(),
  getGitStatus: vi.fn(),
  commitAndPush: vi.fn(),
  pull: vi.fn(),
  hasMergeConflicts: vi.fn(),
  resetHard: vi.fn(),
  cleanUntracked: vi.fn(),
}));

vi.mock('../../../src/lib/sync.js', () => ({
  syncFromClaudeConfig: vi.fn().mockReturnValue([]),
  syncToClaudeConfig: vi.fn().mockReturnValue([]),
  updateLastSync: vi.fn().mockResolvedValue(undefined),
  compareFiles: vi.fn().mockReturnValue([]),
  readMetaJson: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/utils/prompts.js', () => ({
  confirm: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    step: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    dim: vi.fn(),
    heading: vi.fn(),
    table: vi.fn(),
  },
}));

describe('handleSyncPush', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-sync-push-'));
    (paths.getConfigPaths as vi.Mock).mockReturnValue({
      jeanClaudeDir: tempDir + '.jean-claude',
      claudeConfigDir: tempDir + '.claude',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('throws NOT_INITIALIZED when Jean-Claude dir does not exist', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(false);

    await expect(handleSyncPush()).rejects.toThrow('Jean-Claude is not initialized');
  });

  it('throws NOT_GIT_REPO when directory is not a git repo', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(false);

    await expect(handleSyncPush()).rejects.toThrow('is not a Git repository');
  });

  it('returns early when git status is clean', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (sync.syncFromClaudeConfig as vi.Mock).mockResolvedValue([]);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: true,
      modified: [],
      untracked: [],
      branch: null,
      remote: null,
      ahead: 0,
      behind: 0,
    });

    await handleSyncPush();

    expect(logger.logger.success).toHaveBeenCalledWith(
      'Nothing to push - everything is in sync.'
    );
    expect(git.commitAndPush).not.toHaveBeenCalled();
  });

  it('commits and pushes when there are changes', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (sync.syncFromClaudeConfig as vi.Mock).mockResolvedValue([
      { file: 'CLAUDE.md', action: 'copied', source: '', target: '' },
    ]);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: false,
      modified: ['CLAUDE.md'],
      untracked: [],
      branch: 'main',
      remote: 'origin',
      ahead: 0,
      behind: 0,
    });
    (git.commitAndPush as vi.Mock).mockResolvedValue({
      committed: true,
      pushed: true,
    });

    await handleSyncPush();

    expect(sync.syncFromClaudeConfig).toHaveBeenCalled();
    expect(git.commitAndPush).toHaveBeenCalled();
    expect(sync.updateLastSync).toHaveBeenCalled();
  });

  it('warns when no remote configured after commit', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (sync.syncFromClaudeConfig as vi.Mock).mockResolvedValue([]);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: false,
      modified: ['settings.json'],
      untracked: [],
      branch: 'main',
      remote: null,
      ahead: 1,
      behind: 0,
    });
    (git.commitAndPush as vi.Mock).mockResolvedValue({
      committed: true,
      pushed: false,
    });

    await handleSyncPush();

    expect(logger.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No remote configured')
    );
  });
});

describe('handleSyncPull', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-sync-pull-'));
    (paths.getConfigPaths as vi.Mock).mockReturnValue({
      jeanClaudeDir: tempDir + '.jean-claude',
      claudeConfigDir: tempDir + '.claude',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('throws NOT_INITIALIZED when Jean-Claude dir does not exist', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(false);

    await expect(handleSyncPull()).rejects.toThrow('Jean-Claude is not initialized');
  });

  it('throws NOT_GIT_REPO when not a git repo', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(false);

    await expect(handleSyncPull()).rejects.toThrow('is not a Git repository');
  });

  it('throws NO_REMOTE when no remote configured', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: true,
      modified: [],
      untracked: [],
      branch: 'main',
      remote: null,
      ahead: 0,
      behind: 0,
    });

    await expect(handleSyncPull()).rejects.toThrow('No remote configured');
  });

  it('returns early when user declines confirmation', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: false,
      modified: ['CLAUDE.md'],
      untracked: ['new-file.txt'],
      branch: 'main',
      remote: 'origin',
      ahead: 0,
      behind: 0,
    });
    (prompts.confirm as vi.Mock).mockResolvedValue(false);

    await handleSyncPull();

    expect(git.resetHard).not.toHaveBeenCalled();
    expect(logger.logger.dim).toHaveBeenCalledWith(
      expect.stringContaining('Pull cancelled')
    );
  });

  it('pulls and applies when force is true', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: true,
      modified: [],
      untracked: [],
      branch: 'main',
      remote: 'origin',
      ahead: 0,
      behind: 0,
    });
    (git.pull as vi.Mock).mockResolvedValue({ message: 'Already up to date.' });
    (git.hasMergeConflicts as vi.Mock).mockResolvedValue(false);
    (sync.syncToClaudeConfig as vi.Mock).mockResolvedValue([
      { file: 'CLAUDE.md', action: 'created', source: '', target: '' },
    ]);

    await handleSyncPull({ force: true });

    expect(git.resetHard).toHaveBeenCalledWith(tempDir + '.jean-claude');
    expect(git.cleanUntracked).toHaveBeenCalledWith(tempDir + '.jean-claude');
    expect(git.pull).toHaveBeenCalledWith(tempDir + '.jean-claude');
    expect(sync.syncToClaudeConfig).toHaveBeenCalledWith(
      tempDir + '.jean-claude',
      tempDir + '.claude'
    );
    expect(sync.updateLastSync).toHaveBeenCalledWith(tempDir + '.jean-claude');
  });

  it('throws MERGE_CONFLICT when conflicts detected', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: true,
      modified: [],
      untracked: [],
      branch: 'main',
      remote: 'origin',
      ahead: 0,
      behind: 0,
    });
    (git.pull as vi.Mock).mockResolvedValue({ message: 'Pulled.' });
    (git.hasMergeConflicts as vi.Mock).mockResolvedValue(true);

    await expect(handleSyncPull({ force: true })).rejects.toThrow(
      'Merge conflicts detected'
    );
  });
});

describe('handleSyncStatus', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-sync-status-'));
    (paths.getConfigPaths as vi.Mock).mockReturnValue({
      jeanClaudeDir: tempDir + '.jean-claude',
      claudeConfigDir: tempDir + '.claude',
    });
    (sync.compareFiles as vi.Mock).mockReturnValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('throws NOT_INITIALIZED when Jean-Claude dir does not exist', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(false);

    await expect(handleSyncStatus()).rejects.toThrow('Jean-Claude is not initialized');
  });

  it('shows not a git repository message', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(false);
    (sync.compareFiles as vi.Mock).mockReturnValue([]);
    (sync.readMetaJson as vi.Mock).mockResolvedValue(null);

    await handleSyncStatus();

    expect(logger.logger.heading).toHaveBeenCalledWith('Jean-Claude Status');
  });

  it('shows full git status when repo exists', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(true);
    (git.getGitStatus as vi.Mock).mockResolvedValue({
      isClean: true,
      modified: [],
      untracked: [],
      branch: 'main',
      remote: 'origin',
      ahead: 0,
      behind: 0,
    });
    (sync.compareFiles as vi.Mock).mockReturnValue([]);
    (sync.readMetaJson as vi.Mock).mockResolvedValue({
      version: '1.1.0',
      managedBy: 'jean-claude',
      lastSync: null,
      machineId: 'test',
      platform: 'darwin',
      claudeConfigPath: '',
    });

    await handleSyncStatus();

    expect(logger.logger.dim).toHaveBeenCalledWith('Git Status');
  });

  it('shows file sync status with compareFiles results', async () => {
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (git.isGitRepo as vi.Mock).mockResolvedValue(false);
    (sync.compareFiles as vi.Mock).mockReturnValue([
      {
        mapping: { source: 'CLAUDE.md', target: 'CLAUDE.md', type: 'file' },
        inSync: true,
        sourceExists: true,
        targetExists: true,
      },
    ]);
    (sync.readMetaJson as vi.Mock).mockResolvedValue(null);

    await handleSyncStatus();

    expect(sync.compareFiles).toHaveBeenCalled();
  });
});
