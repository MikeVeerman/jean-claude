import { Command } from 'commander';
import chalk from 'chalk';
import { logger, formatPath } from '../utils/logger.js';
import { confirm, input, select } from '../utils/prompts.js';
import {
  loadProfiles,
  createProfile,
  deleteProfile,
  getProfileConfigDir,
  getShellAliasLine,
  installShellAlias,
  removeShellAlias,
  detectShellConfigFiles,
  refreshSymlinks,
  SHARED_ITEMS,
} from '../lib/profiles.js';
import { getJeanClaudeDir } from '../lib/paths.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';
import fs from 'fs-extra';

const profileCreateCommand = new Command('create')
  .description('Create a new Claude Code profile with its own config directory')
  .argument('[name]', 'Profile name (e.g., "work", "personal")')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--shell <file>', 'Shell config file to add alias to (e.g., .zshrc, .bashrc)')
  .action(async (nameArg: string | undefined, options: { yes?: boolean; shell?: string }) => {
    // Verify jean-claude is initialized
    const jcDir = getJeanClaudeDir();
    if (!(await fs.pathExists(jcDir))) {
      throw new JeanClaudeError(
        'Jean-Claude is not initialized',
        ErrorCode.NOT_INITIALIZED,
        'Run `jean-claude init` first.'
      );
    }

    // Get profile name
    const name =
      nameArg || (await input('Profile name (e.g., work, personal):'));

    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new JeanClaudeError(
        'Invalid profile name',
        ErrorCode.INVALID_CONFIG,
        'Use lowercase letters, numbers, and hyphens. Must start with a letter.'
      );
    }

    const configDir = getProfileConfigDir(name);

    logger.heading(`Creating profile: ${name}`);
    console.log();
    logger.table([
      ['Config directory', chalk.cyan(formatPath(configDir))],
      ['Shell alias', chalk.cyan(`claude-${name}`)],
    ]);
    console.log();

    logger.dim('The following items will be symlinked from your main config:');
    logger.list(SHARED_ITEMS.map((i) => i.name));
    console.log();
    logger.dim(
      'Profile-specific files (like CLAUDE.md) will be independent.'
    );
    console.log();

    if (!options.yes) {
      const proceed = await confirm('Create this profile?');
      if (!proceed) {
        logger.dim('Cancelled.');
        return;
      }
    }

    // Create profile
    logger.step(1, 3, 'Creating profile directory and symlinks...');
    const profile = await createProfile(name);
    logger.success('Profile directory created');

    // Install shell alias
    logger.step(2, 3, 'Installing shell alias...');
    let shellFile: string;
    if (options.shell) {
      shellFile = options.shell;
    } else {
      const shellOptions = detectShellConfigFiles();
      shellFile = await select('Add alias to which shell config?', shellOptions);
    }

    await installShellAlias(name, profile, shellFile);
    logger.success(`Alias added to ~/${shellFile}`);

    // Done
    logger.step(3, 3, 'Done!');
    console.log();
    logger.heading('Next steps');
    console.log();
    logger.list([
      `Reload your shell or run: ${chalk.cyan(`source ~/${shellFile}`)}`,
      `Then use ${chalk.cyan(`claude-${name}`)} to launch Claude Code with this profile.`,
      `Edit ${chalk.cyan(formatPath(configDir) + '/CLAUDE.md')} to add profile-specific instructions.`,
    ]);
  });

const profileListCommand = new Command('list')
  .description('List all Claude Code profiles')
  .action(async () => {
    const config = await loadProfiles();
    const names = Object.keys(config.profiles);

    if (names.length === 0) {
      logger.dim('No profiles configured.');
      logger.dim('Create one with: jean-claude profile create <name>');
      return;
    }

    logger.heading('Profiles');
    console.log();

    for (const name of names) {
      const profile = config.profiles[name];
      const exists = await fs.pathExists(profile.configDir);
      const status = exists
        ? chalk.green('active')
        : chalk.red('missing directory');

      console.log(`  ${chalk.bold(name)}`);
      logger.table([
        ['Alias', chalk.cyan(profile.alias)],
        ['Config', formatPath(profile.configDir)],
        ['Status', status],
      ]);

      // Check symlink health
      if (exists) {
        const broken: string[] = [];
        for (const item of SHARED_ITEMS) {
          const itemPath = `${profile.configDir}/${item.name}`;
          try {
            const stat = await fs.lstat(itemPath);
            if (stat.isSymbolicLink()) {
              const target = await fs.readlink(itemPath);
              if (!(await fs.pathExists(target))) {
                broken.push(item.name);
              }
            }
          } catch {
            // Item doesn't exist in profile, that's ok if source doesn't exist either
          }
        }
        if (broken.length > 0) {
          logger.table([
            ['Symlinks', chalk.yellow(`broken: ${broken.join(', ')}`)],
          ]);
        }
      }
      console.log();
    }
  });

const profileDeleteCommand = new Command('delete')
  .description('Delete a Claude Code profile')
  .argument('[name]', 'Profile name to delete')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (nameArg: string | undefined, options: { yes?: boolean }) => {
    const config = await loadProfiles();
    const names = Object.keys(config.profiles);

    if (names.length === 0) {
      logger.dim('No profiles to delete.');
      return;
    }

    const name =
      nameArg ||
      (await select(
        'Which profile to delete?',
        names.map((n) => ({ name: n, value: n }))
      ));

    if (!config.profiles[name]) {
      throw new JeanClaudeError(
        `Profile "${name}" not found`,
        ErrorCode.NOT_INITIALIZED,
        `Available profiles: ${names.join(', ')}`
      );
    }

    const profile = config.profiles[name];

    logger.heading(`Delete profile: ${name}`);
    console.log();
    logger.warn(
      `This will remove ${chalk.cyan(formatPath(profile.configDir))} and its contents.`
    );
    logger.warn('Profile-specific files (like CLAUDE.md) will be lost.');
    logger.dim('Shared files in your main ~/.claude/ are not affected (they are the originals).');
    console.log();

    if (!options.yes) {
      const proceed = await confirm('Delete this profile?', false);
      if (!proceed) {
        logger.dim('Cancelled.');
        return;
      }
    }

    // Delete profile
    logger.step(1, 2, 'Removing profile directory...');
    await deleteProfile(name);
    logger.success('Profile deleted');

    // Remove shell alias
    logger.step(2, 2, 'Cleaning up shell aliases...');
    const shellFiles = ['.zshrc', '.bashrc', '.bash_profile'];
    for (const shellFile of shellFiles) {
      const removed = await removeShellAlias(name, shellFile);
      if (removed) {
        logger.success(`Removed alias from ~/${shellFile}`);
      }
    }

    console.log();
    logger.success(`Profile "${name}" has been removed.`);
  });

const profileRefreshCommand = new Command('refresh')
  .description('Refresh symlinks for a profile (useful if new shared files were added)')
  .argument('[name]', 'Profile name to refresh')
  .action(async (nameArg?: string) => {
    const config = await loadProfiles();
    const names = Object.keys(config.profiles);

    if (names.length === 0) {
      logger.dim('No profiles configured.');
      return;
    }

    const name =
      nameArg ||
      (await select(
        'Which profile to refresh?',
        names.map((n) => ({ name: n, value: n }))
      ));

    logger.dim(`Refreshing symlinks for profile "${name}"...`);
    const created = await refreshSymlinks(name);
    logger.success(`Symlinks refreshed: ${created.join(', ')}`);
  });

export const profileCommand = new Command('profile')
  .description('Manage Claude Code profiles for multiple accounts')
  .addCommand(profileCreateCommand)
  .addCommand(profileListCommand)
  .addCommand(profileDeleteCommand)
  .addCommand(profileRefreshCommand);
