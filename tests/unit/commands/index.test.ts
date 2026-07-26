import {
  initCommand,
  pullCommand,
  pushCommand,
  statusCommand,
  profileCommand,
  syncCommand,
} from '../../../src/commands/index.js';

describe('commands index (barrel exports)', () => {
  it('exports initCommand', () => {
    expect(initCommand).toBeDefined();
    expect(initCommand.name()).toBe('init');
  });

  it('exports pullCommand', () => {
    expect(pullCommand).toBeDefined();
    expect(pullCommand.name()).toBe('pull');
  });

  it('exports pushCommand', () => {
    expect(pushCommand).toBeDefined();
    expect(pushCommand.name()).toBe('push');
  });

  it('exports statusCommand', () => {
    expect(statusCommand).toBeDefined();
    expect(statusCommand.name()).toBe('status');
  });

  it('exports profileCommand', () => {
    expect(profileCommand).toBeDefined();
    expect(profileCommand.name()).toBe('profile');
  });

  it('exports syncCommand', () => {
    expect(syncCommand).toBeDefined();
    expect(syncCommand.name()).toBe('sync');
  });
});
