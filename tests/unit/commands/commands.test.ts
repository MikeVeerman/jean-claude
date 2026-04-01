import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { syncCommand } from '../../../src/commands/sync.js';
import { initCommand } from '../../../src/commands/init.js';
import { pullCommand } from '../../../src/commands/pull.js';
import { pushCommand } from '../../../src/commands/push.js';
import { statusCommand } from '../../../src/commands/status.js';
import * as logger from '../../../src/utils/logger.js';
import * as paths from '../../../src/lib/paths.js';
import * as syncSetup from '../../../src/lib/sync-setup.js';
import * as prompts from '../../../src/utils/prompts.js';

describe('sync command group (#13)', () => {
  it('has subcommands: setup, push, pull, status', () => {
    const subcommandNames = syncCommand.commands.map(c => c.name());
    expect(subcommandNames).toContain('setup');
    expect(subcommandNames).toContain('push');
    expect(subcommandNames).toContain('pull');
    expect(subcommandNames).toContain('status');
  });

  it('sync setup has --url flag (#13)', () => {
    const setupCmd = syncCommand.commands.find(c => c.name() === 'setup');
    expect(setupCmd).toBeDefined();
    const urlOption = setupCmd!.options.find(o => o.long === '--url');
    expect(urlOption).toBeDefined();
  });

  it('sync pull has --force flag (#18)', () => {
    const pullCmd = syncCommand.commands.find(c => c.name() === 'pull');
    expect(pullCmd).toBeDefined();
    const forceOption = pullCmd!.options.find(o => o.long === '--force');
    expect(forceOption).toBeDefined();
  });
});

describe('init command (#20, #21, #38)', () => {
  it('has --sync, --no-sync, and --url options (#20)', () => {
    const optionFlags = initCommand.options.map(o => o.long);
    expect(optionFlags).toContain('--sync');
    expect(optionFlags).toContain('--url');
  });

  it('--sync description contains "without prompting" (#21)', () => {
    const syncOption = initCommand.options.find(o => o.long === '--sync');
    expect(syncOption).toBeDefined();
    expect(syncOption!.description).toContain('without prompting');
  });

  it('--no-sync description contains "without prompting" (#21)', () => {
    const noSyncOption = initCommand.options.find(o => o.long === '--no-sync');
    expect(noSyncOption).toBeDefined();
    expect(noSyncOption!.description).toContain('without prompting');
  });

  it('--url option exists and description contains "implies --sync" (#38)', () => {
    const urlOption = initCommand.options.find(o => o.long === '--url');
    expect(urlOption).toBeDefined();
    expect(urlOption!.description).toContain('implies --sync');
  });
});

describe('init command behavior (#20, #38)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('detects existing .git directory on partial init recovery (#20)', async () => {
    const jeanClaudeDir = path.join(tempDir, '.jean-claude');
    await fs.ensureDir(jeanClaudeDir);

    // Create a .git directory to simulate partial init
    await fs.ensureDir(path.join(jeanClaudeDir, '.git'));

    // Mock paths to use our temp dir
    vi.spyOn(paths, 'getConfigPaths').mockReturnValue({
      jeanClaudeDir,
      claudeConfigDir: path.join(tempDir, '.claude'),
      platform: 'linux',
    });
    vi.spyOn(paths, 'ensureDir').mockImplementation(() => {});

    // Mock setupGitSync to avoid actual git operations
    vi.spyOn(syncSetup, 'setupGitSync').mockResolvedValue();

    // Mock confirm to say no to sync
    vi.spyOn(prompts, 'confirm').mockResolvedValue(false);

    // Spy on logger.info to check for the message
    const infoSpy = vi.spyOn(logger.logger, 'info');

    // Run init command action directly
    await initCommand.parseAsync(['node', 'test', '--no-sync']);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Found existing Git repository')
    );
  });

  it('warns when --url and --no-sync are used together (#38)', async () => {
    const jeanClaudeDir = path.join(tempDir, '.jean-claude');
    await fs.ensureDir(jeanClaudeDir);

    vi.spyOn(paths, 'getConfigPaths').mockReturnValue({
      jeanClaudeDir,
      claudeConfigDir: path.join(tempDir, '.claude'),
      platform: 'linux',
    });
    vi.spyOn(paths, 'ensureDir').mockImplementation(() => {});

    // Mock setupGitSync to avoid actual git operations
    vi.spyOn(syncSetup, 'setupGitSync').mockResolvedValue();

    // Spy on logger.warn
    const warnSpy = vi.spyOn(logger.logger, 'warn');

    await initCommand.parseAsync(['node', 'test', '--no-sync', '--url', 'https://example.com/repo.git']);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('--url implies --sync')
    );
  });
});

describe('deprecated commands (#13, #39)', () => {
  it('deprecated pull command exists and is hidden', () => {
    expect(pullCommand).toBeDefined();
    expect(pullCommand.name()).toBe('pull');
    expect((pullCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });

  it('deprecated pull command has --force flag (#39)', () => {
    const forceOption = pullCommand.options.find(o => o.long === '--force');
    expect(forceOption).toBeDefined();
  });

  it('deprecated push command exists and is hidden', () => {
    expect(pushCommand).toBeDefined();
    expect(pushCommand.name()).toBe('push');
    expect((pushCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });

  it('deprecated status command exists and is hidden', () => {
    expect(statusCommand).toBeDefined();
    expect(statusCommand.name()).toBe('status');
    expect((statusCommand as unknown as { _hidden: boolean })._hidden).toBe(true);
  });
});
