import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  handleProfileCreate,
  handleProfileList,
  handleProfileDelete,
  handleProfileRefresh,
  profileCommand,
} from '../../../src/commands/profile.js';
import * as prompts from '../../../src/utils/prompts.js';
import * as logger from '../../../src/utils/logger.js';
import * as profiles from '../../../src/lib/profiles.js';
import * as paths from '../../../src/lib/paths.js';
import { JeanClaudeError, ErrorCode } from '../../../src/types/index.js';

vi.mock('fs-extra', () => {
  const mock = {
    pathExists: vi.fn(),
    mkdir: vi.fn(),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    remove: vi.fn(),
    readFile: vi.fn(),
    lstat: vi.fn(),
    readlink: vi.fn(),
    symlink: vi.fn(),
    copy: vi.fn(),
    writeJson: vi.fn(),
    rename: vi.fn(),
    readJson: vi.fn(),
    existsSync: vi.fn(),
    mkdtemp: vi.fn(async (prefix) => prefix + '-tmpdir'),
  };
  return {
    default: mock,
    ...mock,
  };
});

vi.mock('../../../src/utils/prompts.js', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  input: vi.fn().mockResolvedValue('work'),
  select: vi.fn().mockResolvedValue('.zshrc'),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    heading: vi.fn(),
    dim: vi.fn(),
    list: vi.fn(),
    table: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../src/lib/profiles.js', () => ({
  loadProfiles: vi.fn(),
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
  refreshSymlinks: vi.fn(),
  installShellAlias: vi.fn(async () => []),
  removeShellAlias: vi.fn(),
  getProfileConfigDir: vi.fn(),
  getShellAliasLine: vi.fn(),
  getReloadInstruction: vi.fn((f: string) => `source ~/${f}`),
  checkSharedItemHealth: vi.fn(async () => []),
  detectShellConfigFiles: vi.fn(),
  SHARED_ITEMS: [
    { name: 'settings.json', type: 'file' },
    { name: 'hooks', type: 'directory' },
  ],
}));

vi.mock('../../../src/lib/paths.js', () => ({
  getJeanClaudeDir: vi.fn(),
  getConfigPaths: vi.fn(() => ({
    claudeConfigDir: '/mock/.claude',
    jeanClaudeDir: '/mock/.jean-claude',
    platform: 'darwin',
  })),
  getProfileConfigDir: vi.fn(),
  detectPlatform: vi.fn(() => 'darwin'),
  contractPath: vi.fn((p) => p),
}));

describe('handleProfileCreate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jc-create-test-'));
    vi.clearAllMocks();

    const jcDir = path.join(tempDir, '.jean-claude');
    (paths.getJeanClaudeDir as vi.Mock).mockReturnValue(jcDir);
    (fs.pathExists as vi.Mock).mockImplementation(async (p) => {
      if (p === jcDir) return true;
      return false;
    });
    (profiles.getProfileConfigDir as vi.Mock).mockImplementation(
      (name: string) => path.join(os.homedir(), `.claude-${name}`)
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('throws NOT_INITIALIZED when Jean-Claude is not initialized', async () => {
    (fs.pathExists as vi.Mock).mockResolvedValue(false);

    await expect(handleProfileCreate('work')).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_INITIALIZED })
    );
  });

  it('throws INVALID_CONFIG for empty profile name', async () => {
    (prompts.input as vi.Mock).mockResolvedValue('');

    await expect(handleProfileCreate(undefined)).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CONFIG })
    );
  });

  it('throws INVALID_CONFIG for name starting with number', async () => {
    await expect(handleProfileCreate('123invalid')).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CONFIG })
    );
  });

  it('throws INVALID_CONFIG for name with uppercase', async () => {
    await expect(handleProfileCreate('InvalidName')).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_CONFIG })
    );
  });

  it('throws ALREADY_EXISTS when profile already registered', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: { work: { alias: 'claude-work', configDir: '' } },
    });

    await expect(handleProfileCreate('work')).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.ALREADY_EXISTS })
    );
  });

  it('throws ALREADY_EXISTS when profile directory exists on disk', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (fs.pathExists as vi.Mock).mockImplementation(async (p) => {
      if (p.includes('.jean-claude')) return true;
      if (p.includes('.claude-work')) return true;
      return false;
    });

    await expect(handleProfileCreate('work')).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.ALREADY_EXISTS })
    );
  });

  it('creates profile with default options when --yes flag used', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (profiles.createProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: path.join(os.homedir(), '.claude-work'),
    });
    (profiles.installShellAlias as vi.Mock).mockResolvedValue([]);
    (profiles.detectShellConfigFiles as vi.Mock).mockReturnValue([]);

    await handleProfileCreate('work', { yes: true });

    expect(profiles.createProfile).toHaveBeenCalledWith('work', {});
    expect(logger.logger.step).toHaveBeenCalledWith(1, 3, expect.stringContaining('Creating'));
    expect(logger.logger.success).toHaveBeenCalledWith('Profile directory created');
  });

  it('prompts for shareStatusline when not specified and not --yes', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (profiles.createProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: path.join(os.homedir(), '.claude-work'),
    });
    (profiles.installShellAlias as vi.Mock).mockResolvedValue([]);
    (profiles.detectShellConfigFiles as vi.Mock).mockReturnValue([]);
    (prompts.confirm as vi.Mock).mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await handleProfileCreate('work', {});

    expect(prompts.confirm).toHaveBeenCalledWith(
      'Share your statusline configuration with this profile?'
    );
  });

  it('shows independent CLAUDE.md message when shareClaudeMd is false', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (profiles.createProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: path.join(os.homedir(), '.claude-work'),
    });
    (profiles.installShellAlias as vi.Mock).mockResolvedValue([]);
    (profiles.detectShellConfigFiles as vi.Mock).mockReturnValue([]);
    (prompts.confirm as vi.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await handleProfileCreate('work', {});

    expect(logger.logger.dim).toHaveBeenCalledWith(
      expect.stringContaining('Profile-specific files')
    );
  });

  it('cancels when user declines final confirmation', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (prompts.confirm as vi.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await handleProfileCreate('work', {});

    expect(profiles.createProfile).not.toHaveBeenCalled();
    expect(logger.logger.dim).toHaveBeenCalledWith('Cancelled.');
  });

  it('uses --shell option to skip shell selection', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });
    (profiles.createProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: path.join(os.homedir(), '.claude-work'),
    });
    (profiles.installShellAlias as vi.Mock).mockResolvedValue([]);
    (prompts.confirm as vi.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await handleProfileCreate('work', { yes: true, shell: '.bashrc' });

    expect(profiles.installShellAlias).toHaveBeenCalledWith(
      'work',
      expect.any(Object),
      '.bashrc'
    );
    expect(prompts.select).not.toHaveBeenCalled();
  });
});

describe('handleProfileList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message when no profiles configured', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });

    await handleProfileList();

    expect(logger.logger.dim).toHaveBeenCalledWith('No profiles configured.');
    expect(logger.logger.dim).toHaveBeenCalledWith(
      expect.stringContaining('jean-claude profile create')
    );
  });

  it('displays profile info when profiles exist', async () => {
    const mockConfigDir = path.join(os.homedir(), '.claude-work');
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: mockConfigDir },
      },
    });
    (fs.pathExists as vi.Mock).mockResolvedValue(true);

    await handleProfileList();

    expect(logger.logger.heading).toHaveBeenCalledWith('Profiles');
    expect(logger.logger.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining(['Alias', 'claude-work']),
        expect.arrayContaining(['Status', 'active']),
      ])
    );
  });

  it('shows missing directory status when profile dir does not exist', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: '/nonexistent' },
      },
    });
    (fs.pathExists as vi.Mock).mockResolvedValue(false);

    await handleProfileList();

    expect(logger.logger.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining(['Status', 'missing directory']),
      ])
    );
  });

  it('detects broken symlinks', async () => {
    const mockConfigDir = path.join(os.homedir(), '.claude-work');
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: mockConfigDir },
      },
    });
    (fs.pathExists as vi.Mock).mockResolvedValue(true);
    (profiles.checkSharedItemHealth as vi.Mock).mockResolvedValue([
      { name: 'settings.json', kind: 'broken' },
    ]);

    await handleProfileList();

    expect(logger.logger.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining(['Symlinks', expect.stringContaining('broken')]),
      ])
    );
  });

  it('reports stale links with a refresh hint', async () => {
    const mockConfigDir = path.join(os.homedir(), '.claude-work');
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: mockConfigDir },
      },
    });
    (fs.pathExists as vi.Mock).mockResolvedValue(true);
    (profiles.checkSharedItemHealth as vi.Mock).mockResolvedValue([
      { name: 'settings.json', kind: 'stale' },
    ]);

    await handleProfileList();

    expect(logger.logger.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.arrayContaining(['Links', expect.stringContaining('stale')]),
      ])
    );
    expect(logger.logger.dim).toHaveBeenCalledWith(
      expect.stringContaining('profile refresh work')
    );
  });
});

describe('handleProfileDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message when no profiles to delete', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });

    await handleProfileDelete();

    expect(logger.logger.dim).toHaveBeenCalledWith('No profiles to delete.');
  });

  it('deletes profile after confirmation', async () => {
    const mockConfigDir = path.join(os.homedir(), '.claude-work');
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: mockConfigDir },
      },
    });
    (profiles.deleteProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: mockConfigDir,
    });
    (profiles.removeShellAlias as vi.Mock).mockResolvedValue(false);
    (prompts.confirm as vi.Mock).mockResolvedValue(true);

    await handleProfileDelete('work', { yes: true });

    expect(profiles.deleteProfile).toHaveBeenCalledWith('work');
    expect(logger.logger.success).toHaveBeenCalledWith(
      'Profile "work" has been removed.'
    );
  });

  it('cancels delete when user declines confirmation', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: '' },
      },
    });
    (prompts.confirm as vi.Mock).mockResolvedValue(false);

    await handleProfileDelete('work');

    expect(profiles.deleteProfile).not.toHaveBeenCalled();
    expect(logger.logger.dim).toHaveBeenCalledWith('Cancelled.');
  });

  it('prompts for profile name when not provided', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: '' },
        personal: { alias: 'claude-personal', configDir: '' },
      },
    });
    (profiles.deleteProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: '',
    });
    (profiles.removeShellAlias as vi.Mock).mockResolvedValue(false);
    (prompts.select as vi.Mock).mockResolvedValue('work');
    (prompts.confirm as vi.Mock).mockResolvedValue(true);

    await handleProfileDelete();

    expect(prompts.select).toHaveBeenCalledWith(
      'Which profile to delete?',
      expect.arrayContaining([
        { name: 'work', value: 'work' },
        { name: 'personal', value: 'personal' },
      ])
    );
  });

  it('removes shell aliases for deleted profile', async () => {
    const mockConfigDir = path.join(os.homedir(), '.claude-work');
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: mockConfigDir },
      },
    });
    (profiles.deleteProfile as vi.Mock).mockResolvedValue({
      alias: 'claude-work',
      configDir: mockConfigDir,
    });
    (profiles.removeShellAlias as vi.Mock).mockResolvedValue(true);

    await handleProfileDelete('work', { yes: true });

    expect(profiles.removeShellAlias).toHaveBeenCalledWith(
      'work',
      '.zshrc'
    );
    expect(profiles.removeShellAlias).toHaveBeenCalledWith(
      'work',
      '.bashrc'
    );
    expect(profiles.removeShellAlias).toHaveBeenCalledWith(
      'work',
      '.bash_profile'
    );
  });
});

describe('handleProfileRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message when no profiles configured', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({ profiles: {} });

    await handleProfileRefresh();

    expect(logger.logger.dim).toHaveBeenCalledWith('No profiles configured.');
  });

  it('refreshes symlinks for a profile', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: '' },
      },
    });
    (profiles.refreshSymlinks as vi.Mock).mockResolvedValue([
      'settings.json',
      'hooks',
    ]);

    await handleProfileRefresh('work');

    expect(profiles.refreshSymlinks).toHaveBeenCalledWith('work');
    expect(logger.logger.success).toHaveBeenCalledWith(
      expect.stringContaining('Symlinks refreshed')
    );
  });

  it('prompts for profile name when not provided', async () => {
    (profiles.loadProfiles as vi.Mock).mockResolvedValue({
      profiles: {
        work: { alias: 'claude-work', configDir: '' },
        personal: { alias: 'claude-personal', configDir: '' },
      },
    });
    (profiles.refreshSymlinks as vi.Mock).mockResolvedValue(['settings.json']);
    (prompts.select as vi.Mock).mockResolvedValue('personal');

    await handleProfileRefresh();

    expect(prompts.select).toHaveBeenCalledWith(
      'Which profile to refresh?',
      expect.arrayContaining([
        { name: 'work', value: 'work' },
        { name: 'personal', value: 'personal' },
      ])
    );
  });
});

describe('profileCommand structure', () => {
  it('has all subcommands', () => {
    const subcommandNames = profileCommand.commands.map((c) => c.name());
    expect(subcommandNames).toContain('create');
    expect(subcommandNames).toContain('list');
    expect(subcommandNames).toContain('delete');
    expect(subcommandNames).toContain('refresh');
  });
});
