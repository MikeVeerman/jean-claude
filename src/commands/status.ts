import { Command } from 'commander';
import chalk from 'chalk';

const cmd = new Command('status')
  .description('(deprecated) Use "jean-claude sync status" instead')
  .action(async () => {
    console.log(
      chalk.yellow('This command has moved.') +
      ' Did you mean ' +
      chalk.cyan('jean-claude sync status') +
      '?'
    );
    process.exit(1);
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const statusCommand = cmd;
