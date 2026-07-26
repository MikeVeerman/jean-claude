import inquirer from 'inquirer';
import { confirm, input, select } from '../../../src/utils/prompts.js';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

describe('prompts utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('confirm', () => {
    it('returns true when confirmed is true', async () => {
      (inquirer.prompt as vi.Mock).mockResolvedValue({ confirmed: true });

      const result = await confirm('Are you sure?');

      expect(result).toBe(true);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure?',
          default: true,
        },
      ]);
    });

    it('returns false when confirmed is false', async () => {
      (inquirer.prompt as vi.Mock).mockResolvedValue({ confirmed: false });

      const result = await confirm('Continue?', true);

      expect(result).toBe(false);
      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Continue?',
          default: true,
        },
      ]);
    });

    it('uses provided default value', async () => {
      (inquirer.prompt as vi.Mock).mockResolvedValue({ confirmed: false });

      await confirm('Skip?', false);

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Skip?',
          default: false,
        },
      ]);
    });
  });

  describe('input', () => {
    it('returns the input value', async () => {
      (inquirer.prompt as vi.Mock).mockResolvedValue({ value: 'my-profile' });

      const result = await input('Profile name:');

      expect(result).toBe('my-profile');
      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'input',
          name: 'value',
          message: 'Profile name:',
          default: undefined,
        },
      ]);
    });

    it('uses provided default value', async () => {
      (inquirer.prompt as vi.Mock).mockResolvedValue({ value: 'work' });

      await input('Profile name:', 'work');

      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'input',
          name: 'value',
          message: 'Profile name:',
          default: 'work',
        },
      ]);
    });
  });

  describe('select', () => {
    it('returns the selected value', async () => {
      const choices = [
        { name: 'zsh', value: '.zshrc' },
        { name: 'bash', value: '.bashrc' },
      ];
      (inquirer.prompt as vi.Mock).mockResolvedValue({ selected: '.zshrc' });

      const result = await select('Which shell?', choices);

      expect(result).toBe('.zshrc');
      expect(inquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'list',
          name: 'selected',
          message: 'Which shell?',
          choices,
        },
      ]);
    });

    it('returns the second choice', async () => {
      const choices = [
        { name: 'zsh', value: '.zshrc' },
        { name: 'bash', value: '.bashrc' },
      ];
      (inquirer.prompt as vi.Mock).mockResolvedValue({ selected: '.bashrc' });

      const result = await select('Which shell?', choices);

      expect(result).toBe('.bashrc');
    });
  });
});
