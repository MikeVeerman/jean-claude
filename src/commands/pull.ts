import { Command } from 'commander';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger, formatPath } from '../utils/logger.js';
import { getConfigPaths } from '../lib/paths.js';
import { isGitRepo, pull, getGitStatus, hasMergeConflicts, resetHard, cleanUntracked } from '../lib/git.js';
import { syncToClaudeConfig, updateLastSync } from '../lib/sync.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

export const pullCommand = new Command('pull')
  .description('Pull latest config from Git and apply to Claude Code')
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

    // Check if remote is configured
    const gitStatus = await getGitStatus(jeanClaudeDir);
    if (!gitStatus.remote) {
      throw new JeanClaudeError(
        'No remote configured',
        ErrorCode.NO_REMOTE,
        'Run "jean-claude init" to set up a remote repository.'
      );
    }

    // Reset any local changes, clean untracked files, and pull
    logger.step(1, 2, 'Pulling from Git...');
    await resetHard(jeanClaudeDir);
    await cleanUntracked(jeanClaudeDir);
    const pullResult = await pull(jeanClaudeDir);
    logger.success(pullResult.message);

    // Check for merge conflicts (shouldn't happen after reset, but just in case)
    if (await hasMergeConflicts(jeanClaudeDir)) {
      throw new JeanClaudeError(
        'Merge conflicts detected',
        ErrorCode.MERGE_CONFLICT,
        `Resolve conflicts in ${formatPath(jeanClaudeDir)} and run pull again.`
      );
    }

    // Apply to ~/.claude
    logger.step(2, 2, `Applying to ${formatPath(claudeConfigDir)}...`);
    const results = await syncToClaudeConfig(jeanClaudeDir, claudeConfigDir);
    const applied = results.filter((r) => r.action !== 'skipped');

    // Update last sync time
    await updateLastSync(jeanClaudeDir);

    // Summary
    console.log('');
    logger.success(`Applied ${applied.length} file(s)`);
    applied.forEach((r) => {
      const icon = r.action === 'created' ? chalk.green('+') : chalk.yellow('~');
      console.log(`  ${icon} ${r.file}`);
    });
  });
