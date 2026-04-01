import { Command } from 'commander';
import fs from 'fs-extra';
import os from 'os';
import chalk from 'chalk';
import { logger, formatPath } from '../utils/logger.js';
import { getConfigPaths } from '../lib/paths.js';
import { isGitRepo, getGitStatus, commitAndPush, pull, hasMergeConflicts, resetHard, cleanUntracked } from '../lib/git.js';
import { syncFromClaudeConfig, syncToClaudeConfig, updateLastSync, compareFiles, readMetaJson } from '../lib/sync.js';
import { setupGitSync } from '../lib/sync-setup.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

function generateCommitMessage(): string {
  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `Update from ${hostname} at ${timestamp}`;
}

const syncSetupCommand = new Command('setup')
  .description('Set up Git-based syncing for your configuration')
  .action(async () => {
    const { jeanClaudeDir } = getConfigPaths();

    if (!fs.existsSync(jeanClaudeDir)) {
      throw new JeanClaudeError(
        'Jean-Claude is not initialized',
        ErrorCode.NOT_INITIALIZED,
        'Run "jean-claude init" first.'
      );
    }

    await setupGitSync(jeanClaudeDir);

    console.log('');
    logger.dim('Next steps:');
    logger.list([
      'Run "jean-claude sync push" to push your config to Git',
      'Run "jean-claude sync pull" on other machines to sync',
    ]);
  });

export async function handleSyncPush(): Promise<void> {
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
      'Run "jean-claude sync setup" to configure syncing.'
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
    logger.dim(`Add a remote with: git -C ${formatPath(jeanClaudeDir)} remote add origin <url>`);
  }
}

const syncPushCommand = new Command('push')
  .description('Commit and push config changes to Git')
  .action(handleSyncPush);

export async function handleSyncPull(): Promise<void> {
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
      'Run "jean-claude sync setup" to configure syncing.'
    );
  }

  // Check if remote is configured
  const gitStatus = await getGitStatus(jeanClaudeDir);
  if (!gitStatus.remote) {
    throw new JeanClaudeError(
      'No remote configured',
      ErrorCode.NO_REMOTE,
      'Run "jean-claude sync setup" to set up a remote repository.'
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
}

const syncPullCommand = new Command('pull')
  .description('Pull latest config from Git and apply to Claude Code')
  .action(handleSyncPull);

export async function handleSyncStatus(): Promise<void> {
  const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

  // Verify initialized
  if (!fs.existsSync(jeanClaudeDir)) {
    throw new JeanClaudeError(
      'Jean-Claude is not initialized',
      ErrorCode.NOT_INITIALIZED,
      'Run "jean-claude init" first.'
    );
  }

  const isRepo = await isGitRepo(jeanClaudeDir);
  const gitStatus = isRepo ? await getGitStatus(jeanClaudeDir) : null;
  const meta = await readMetaJson(jeanClaudeDir);
  const fileComparison = compareFiles(jeanClaudeDir, claudeConfigDir);

  // Pretty output
  logger.heading('Jean-Claude Status');

  console.log('');
  logger.table([
    ['Repository', formatPath(jeanClaudeDir)],
    ['Claude Config', formatPath(claudeConfigDir)],
    ['Platform', meta?.platform || 'unknown'],
  ]);

  // Git status
  console.log('');
  logger.dim('Git Status');
  if (!isRepo) {
    console.log(`  ${chalk.red('✗')} Not a Git repository`);
    logger.dim('  Run "jean-claude sync setup" to enable syncing.');
  } else if (gitStatus) {
    console.log(
      `  ${chalk.dim('Branch:')}  ${gitStatus.branch || 'unknown'}`
    );
    console.log(
      `  ${chalk.dim('Remote:')}  ${gitStatus.remote || chalk.yellow('none')}`
    );

    if (gitStatus.isClean) {
      console.log(`  ${chalk.green('✓')} Working tree clean`);
    } else {
      console.log(
        `  ${chalk.yellow('!')} ${gitStatus.modified.length + gitStatus.untracked.length} uncommitted change(s)`
      );
    }

    if (gitStatus.ahead > 0) {
      console.log(`  ${chalk.blue('↑')} ${gitStatus.ahead} commit(s) ahead`);
    }
    if (gitStatus.behind > 0) {
      console.log(`  ${chalk.yellow('↓')} ${gitStatus.behind} commit(s) behind`);
    }
  }

  // File sync status
  console.log('');
  logger.dim('Sync Status');
  fileComparison.forEach((c) => {
    let status: string;
    let icon: string;

    if (!c.sourceExists) {
      status = chalk.dim('not configured');
      icon = chalk.dim('-');
    } else if (!c.targetExists) {
      status = chalk.yellow('not applied');
      icon = chalk.yellow('!');
    } else if (c.inSync) {
      status = chalk.green('in sync');
      icon = chalk.green('✓');
    } else {
      status = chalk.yellow('differs');
      icon = chalk.yellow('!');
    }

    console.log(
      `  ${icon} ${c.mapping.source.padEnd(15)} ${chalk.dim('→')} ${c.mapping.target.padEnd(15)} ${status}`
    );
  });

  // Last sync
  if (meta?.lastSync) {
    console.log('');
    logger.dim(`Last sync: ${new Date(meta.lastSync).toLocaleString()}`);
  }
}

const syncStatusCommand = new Command('status')
  .description('Show sync status')
  .action(handleSyncStatus);

export const syncCommand = new Command('sync')
  .description('Manage Git-based syncing of your configuration')
  .addCommand(syncSetupCommand)
  .addCommand(syncPushCommand)
  .addCommand(syncPullCommand)
  .addCommand(syncStatusCommand);
