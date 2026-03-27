import { Command } from 'commander';
import chalk from 'chalk';

const cmd = new Command('push')
  .description('(deprecated) Use "jean-claude sync push" instead')
  .action(async () => {
    console.log(
      chalk.yellow('This command has moved.') +
      ' Did you mean ' +
      chalk.cyan('jean-claude sync push') +
      '?'
    );
    process.exit(1);
  });

(cmd as unknown as { _hidden: boolean })._hidden = true;
export const pushCommand = cmd;
