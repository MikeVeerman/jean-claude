import { Command } from 'commander';
import fs from 'fs-extra';
import { logger, formatPath } from '../utils/logger.js';
import { input } from '../utils/prompts.js';
import { getConfigPaths, ensureDir } from '../lib/paths.js';
import { isGitRepo, initRepo, addRemote, testRemoteConnection, cloneRepo } from '../lib/git.js';
import {
  createMetaJson,
  writeMetaJson,
  syncFromClaudeConfig,
} from '../lib/sync.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';
import { printLogo } from '../utils/logo.js';

export const initCommand = new Command('init')
  .description('Initialize Jean-Claude on this machine')
  .action(async () => {
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

    // Get repository URL
    const repoUrl = await input('Enter your Git repository URL:');

    // Test connection to remote
    logger.step(1, 4, 'Testing connection to repository...');
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
    logger.step(2, 4, 'Setting up local repository...');
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

    // Create meta.json
    const meta = createMetaJson(claudeConfigDir);
    await writeMetaJson(jeanClaudeDir, meta);

    // Sync from ~/.claude to ~/.jean-claude
    logger.step(3, 4, `Syncing from ${formatPath(claudeConfigDir)}...`);
    const syncResults = await syncFromClaudeConfig(claudeConfigDir, jeanClaudeDir);
    const synced = syncResults.filter((r) => r.action !== 'skipped');
    if (synced.length > 0) {
      logger.success(`Synced ${synced.length} file(s)`);
    }

    // Done
    logger.step(4, 4, 'Done!');
    console.log('');
    logger.success('Jean-Claude initialized!');
    console.log('');
    logger.dim('Next steps:');
    logger.list([
      'Run "jean-claude push" to push your config to Git',
      'Run "jean-claude pull" on other machines to sync',
    ]);
  });
