import chalk from 'chalk';

export function printLogo(): void {
  const o = chalk.hex('#FF6B4A');
  const g = chalk.gray;

  console.log('\n' + o('JEAN-CLAUDE'));
  console.log(g('A companion for syncing Claude Code configuration\n'));
}
