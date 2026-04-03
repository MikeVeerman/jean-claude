import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncPull } from './sync.js';

const cmd = new Command('pull')
  .description('(deprecated) Use "jean-claude sync pull" instead')
  .option('--force', 'Skip confirmation when discarding local changes')
  .action(async (options: { force?: boolean }) => {
    console.error(
      chalk.yellow('Warning:') +
      ' "jean-claude pull" is deprecated. Use ' +
      chalk.cyan('jean-claude sync pull') +
      ' instead.'
    );
    console.error('');
    await handleSyncPull(options);
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const pullCommand = cmd;
