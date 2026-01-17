import { Command } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'module';
import {
  initCommand,
  pullCommand,
  pushCommand,
  statusCommand,
} from './commands/index.js';
import { JeanClaudeError } from './types/index.js';
import { printLogo } from './utils/logo.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

export function createProgram(): Command {
  const program = new Command();

  program
    .name('jean-claude')
    .description('Sync Claude Code configuration across machines using Git')
    .version(VERSION)
    .addHelpText('before', () => {
      printLogo();
      return '';
    });

  program.addCommand(initCommand);
  program.addCommand(pullCommand);
  program.addCommand(pushCommand);
  program.addCommand(statusCommand);

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = createProgram();

  // Global error handling
  program.exitOverride();

  try {
    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof JeanClaudeError) {
      console.error(chalk.red('error') + ' ' + err.message);
      if (err.suggestion) {
        console.log('\n' + chalk.dim('Suggestion: ') + err.suggestion);
      }
      process.exit(1);
    }

    // Commander errors (like --help, --version)
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'commander.helpDisplayed' || code === 'commander.version' || code === 'commander.help') {
        process.exit(0);
      }
    }

    // Unexpected error
    console.error(chalk.red('error') + ' An unexpected error occurred');
    if (process.env.DEBUG) {
      console.error(err);
    } else {
      console.log(chalk.dim('Run with DEBUG=1 for more details'));
    }
    process.exit(1);
  }
}
