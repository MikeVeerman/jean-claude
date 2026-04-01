import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncStatus } from './sync.js';

const cmd = new Command('status')
  .description('(deprecated) Use "jean-claude sync status" instead')
  .action(async () => {
    console.error(
      chalk.yellow('Warning:') +
      ' "jean-claude status" is deprecated. Use ' +
      chalk.cyan('jean-claude sync status') +
      ' instead.'
    );
    console.error('');
    await handleSyncStatus();
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const statusCommand = cmd;
