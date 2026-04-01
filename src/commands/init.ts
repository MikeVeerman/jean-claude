import { Command } from 'commander';
import fs from 'fs-extra';
import { logger, formatPath } from '../utils/logger.js';
import { confirm, input } from '../utils/prompts.js';
import { getConfigPaths, ensureDir } from '../lib/paths.js';
import { isGitRepo, initRepo, addRemote, testRemoteConnection, cloneRepo } from '../lib/git.js';
import {
  createMetaJson,
  writeMetaJson,
} from '../lib/sync.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';
import { printLogo } from '../utils/logo.js';

export const initCommand = new Command('init')
  .description('Initialize Jean-Claude on this machine')
  .argument('[url]', 'Git remote URL for syncing')
  .option('--sync', 'Set up Git-based syncing (skip prompt)')
  .option('--no-sync', 'Skip syncing setup (skip prompt)')
  .action(async (url: string | undefined, options: { sync?: boolean }) => {
    const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

    printLogo();
    logger.heading('Setup');

    // Check if already initialized
    if (fs.existsSync(jeanClaudeDir)) {
      const isRepo = await isGitRepo(jeanClaudeDir);
      if (isRepo) {
        logger.success(`Already initialized at ${formatPath(jeanClaudeDir)}`);
        logger.dim('Run "jean-claude status" to see current state.');
        return;
      }
      throw new JeanClaudeError(
        `${formatPath(jeanClaudeDir)} exists but is not a Git repository`,
        ErrorCode.NOT_GIT_REPO,
        'Remove the directory and run init again.'
      );
    }

    // Determine whether to set up syncing
    let wantSync: boolean;
    if (url) {
      if (options.sync === false) {
        logger.warn('--url implies --sync; ignoring --no-sync.');
      }
      wantSync = true;
    } else if (options.sync !== undefined) {
      wantSync = options.sync;
    } else {
      console.log('');
      wantSync = await confirm('Would you like to set up syncing with a Git remote?');
    }

    if (wantSync) {
      // Get repository URL (from argument or prompt)
      const repoUrl = url ?? await input('Repository URL:');

      // Test connection to remote
      logger.step(1, 3, 'Testing connection to repository...');
      const canConnect = await testRemoteConnection(repoUrl);
      if (!canConnect) {
        throw new JeanClaudeError(
          'Cannot connect to repository',
          ErrorCode.NETWORK_ERROR,
          'Check that the URL is correct and you have access.'
        );
      }
      logger.success('Connection successful');

      // Try to clone (will work if repo has content) or init fresh (if empty)
      logger.step(2, 3, 'Setting up local repository...');
      try {
        await cloneRepo(repoUrl, jeanClaudeDir);
        logger.success('Cloned existing config from repository');
      } catch {
        // Repo is empty, init locally and add remote
        ensureDir(jeanClaudeDir);
        await initRepo(jeanClaudeDir);
        await addRemote(jeanClaudeDir, repoUrl);
        logger.success('Initialized new repository');
      }
    } else {
      // Local-only init without Git syncing
      ensureDir(jeanClaudeDir);
      await initRepo(jeanClaudeDir);
    }

    // Create meta.json
    const meta = createMetaJson(claudeConfigDir);
    await writeMetaJson(jeanClaudeDir, meta);

    // Done
    console.log('');
    logger.success('Jean-Claude initialized!');
    console.log('');
    logger.dim('Next steps:');

    if (wantSync) {
      logger.list([
        'Run "jean-claude push" to push your config to Git',
        'Run "jean-claude pull" on other machines to sync',
      ]);
    } else {
      logger.list([
        'Run "jean-claude init <url>" to set up syncing later',
      ]);
    }
  });
