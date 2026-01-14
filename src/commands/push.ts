import { Command } from 'commander';
import fs from 'fs-extra';
import os from 'os';
import chalk from 'chalk';
import { logger, formatPath } from '../utils/logger.js';
import { getConfigPaths } from '../lib/paths.js';
import { isGitRepo, getGitStatus, commitAndPush } from '../lib/git.js';
import { updateLastSync, syncFromClaudeConfig } from '../lib/sync.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

function generateCommitMessage(): string {
  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `Update from ${hostname} at ${timestamp}`;
}

export const pushCommand = new Command('push')
  .description('Commit and push config changes to Git')
  .action(async () => {
    const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

    // Verify initialized
    if (!fs.existsSync(jeanClaudeDir)) {
      throw new JeanClaudeError(
        'Jean-Claude is not initialized',
        ErrorCode.NOT_INITIALIZED,
        'Run "jean-claude init" first.'
      );
    }

    if (!(await isGitRepo(jeanClaudeDir))) {
      throw new JeanClaudeError(
        `${formatPath(jeanClaudeDir)} is not a Git repository`,
        ErrorCode.NOT_GIT_REPO,
        'Run "jean-claude init" to set up properly.'
      );
    }

    // Step 1: Copy files from ~/.claude to ~/.jean-claude
    logger.step(1, 2, `Syncing from ${formatPath(claudeConfigDir)}...`);
    const syncResults = await syncFromClaudeConfig(claudeConfigDir, jeanClaudeDir);
    const synced = syncResults.filter((r) => r.action !== 'skipped');
    if (synced.length > 0) {
      synced.forEach((r) => {
        console.log(`  ${chalk.blue('synced')}  ${r.file}`);
      });
    }

    // Step 2: Check git status
    const gitStatus = await getGitStatus(jeanClaudeDir);

    if (gitStatus.isClean) {
      logger.success('Nothing to push - everything is in sync.');
      return;
    }

    // Show changes
    logger.dim('Changes to push:');
    if (gitStatus.modified.length > 0) {
      gitStatus.modified.forEach((f) => {
        console.log(`  ${chalk.yellow('modified')}  ${f}`);
      });
    }
    if (gitStatus.untracked.length > 0) {
      gitStatus.untracked.forEach((f) => {
        console.log(`  ${chalk.green('new file')}  ${f}`);
      });
    }

    // Commit message
    const commitMessage = generateCommitMessage();

    // Commit and push
    logger.step(2, 2, 'Committing and pushing...');

    const result = await commitAndPush(jeanClaudeDir, commitMessage, true);

    // Update last sync
    await updateLastSync(jeanClaudeDir);

    // Summary
    console.log('');
    if (result.committed) {
      logger.success('Changes committed');
    }
    if (result.pushed) {
      logger.success('Pushed to remote');
    } else if (!gitStatus.remote) {
      logger.warn('No remote configured - changes committed locally only');
      logger.dim('Add a remote with: git -C ~/.jean-claude remote add origin <url>');
    }
  });
