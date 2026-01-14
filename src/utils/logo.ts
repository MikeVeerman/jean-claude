import chalk from 'chalk';

export function printLogo(): void {
  const logo = `
       ${chalk.red('▄████▄')}
      ${chalk.red('████████')}
    ${chalk.hex('#FF6B4A')('██████████████')}
    ${chalk.hex('#FF6B4A')('███')}${chalk.white('▀▀')}${chalk.hex('#FF6B4A')('████')}${chalk.white('▀▀')}${chalk.hex('#FF6B4A')('███')}
    ${chalk.hex('#FF6B4A')('██████████████')}${chalk.gray('━━●')}
      ${chalk.hex('#FF6B4A')('██')}${chalk.white('██████')}${chalk.hex('#FF6B4A')('██')}
      ${chalk.hex('#FF6B4A')('██')}      ${chalk.hex('#FF6B4A')('██')}
`;
  console.log(logo);
}
