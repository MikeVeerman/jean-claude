import { Command } from 'commander';
import chalk from 'chalk';
import { handleSyncPush } from './sync.js';

const cmd = new Command('push')
  .description('(deprecated) Use "jean-claude sync push" instead')
  .action(async () => {
    console.error(
      chalk.yellow('Warning:') +
      ' "jean-claude push" is deprecated. Use ' +
      chalk.cyan('jean-claude sync push') +
      ' instead.'
    );
    console.error('');
    await handleSyncPush();
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const pushCommand = cmd;
