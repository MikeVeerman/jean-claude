import { syncCommand } from '../../../src/commands/sync.js';
import { initCommand } from '../../../src/commands/init.js';
import { pullCommand } from '../../../src/commands/pull.js';
import { pushCommand } from '../../../src/commands/push.js';
import { statusCommand } from '../../../src/commands/status.js';

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
