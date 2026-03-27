import { Command } from 'commander';
import chalk from 'chalk';

const cmd = new Command('pull')
  .description('(deprecated) Use "jean-claude sync pull" instead')
  .action(async () => {
    console.log(
      chalk.yellow('This command has moved.') +
      ' Did you mean ' +
      chalk.cyan('jean-claude sync pull') +
      '?'
    );
    process.exit(1);
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const pullCommand = cmd;
