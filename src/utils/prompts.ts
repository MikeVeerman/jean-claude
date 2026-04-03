import inquirer from 'inquirer';

export async function confirm(
  message: string,
  defaultValue = true
): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

export async function input(
  message: string,
  defaultValue?: string
): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: defaultValue,
    },
  ]);
  return value;
}

export async function select<T extends string>(
  message: string,
  choices: Array<{ name: string; value: T }>
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
    },
  ]);
  return selected;
}
