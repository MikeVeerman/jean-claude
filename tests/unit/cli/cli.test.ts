import { Command } from 'commander';
import { createProgram, run } from '../../../src/cli.js';
import { JeanClaudeError, ErrorCode } from '../../../src/types/index.js';
import * as commands from '../../../src/commands/index.js';
import * as logo from '../../../src/utils/logo.js';

vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    addHelpText: vi.fn().mockReturnThis(),
    addCommand: vi.fn().mockReturnThis(),
    exitOverride: vi.fn().mockReturnThis(),
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/commands/index.js', () => ({
  initCommand: { addCommand: vi.fn() },
  syncCommand: { addCommand: vi.fn() },
  profileCommand: { addCommand: vi.fn() },
  pullCommand: { addCommand: vi.fn() },
  pushCommand: { addCommand: vi.fn() },
  statusCommand: { addCommand: vi.fn() },
}));

vi.mock('../../../src/utils/logo.js', () => ({
  printLogo: vi.fn(),
}));

describe('CLI entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProgram', () => {
    it('creates a program with correct name and version', () => {
      const program = createProgram();

      expect(Command).toHaveBeenCalledTimes(1);
      const callArgs = (Command as vi.Mock).mock.calls[0];
      expect(callArgs).toBeDefined();
    });

    it('adds all command groups', () => {
      const addCommandSpies: vi.Mock[] = [];

      vi.spyOn(commands, 'initCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));
      vi.spyOn(commands, 'syncCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));
      vi.spyOn(commands, 'profileCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));
      vi.spyOn(commands, 'pullCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));
      vi.spyOn(commands, 'pushCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));
      vi.spyOn(commands, 'statusCommand', 'get').mockImplementation(() => ({
        addCommand: vi.fn(),
      }));

      createProgram();
    });

    it('sets help text before with logo', () => {
      const logoSpy = vi.spyOn(logo, 'printLogo');
      createProgram();
      expect(logoSpy).toBeDefined();
    });
  });

  describe('run', () => {
    it('handles JeanClaudeError with suggestion', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(
          new JeanClaudeError('test error', ErrorCode.NOT_INITIALIZED, 'run init')
        ),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('handles JeanClaudeError without suggestion', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(
          new JeanClaudeError('no suggestion error', ErrorCode.NOT_GIT_REPO)
        ),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('handles Commander help error with exit code 0', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue({ code: 'commander.help' }),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('handles unexpected error with exit code 1', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(new Error('unexpected')),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    it('exits with 0 for helpDisplayed code', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue({ code: 'commander.helpDisplayed' }),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });

    it('exits with 0 for version code', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.mocked(Command).mockImplementationOnce(() => ({
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        addCommand: vi.fn().mockReturnThis(),
        exitOverride: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue({ code: 'commander.version' }),
      }));

      await expect(run(['test'])).rejects.toThrow('process.exit called');
      expect(exitSpy).toHaveBeenCalledWith(0);
      exitSpy.mockRestore();
    });
  });
});
