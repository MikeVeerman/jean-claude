import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'path';
import { logger, formatPath } from '../utils/logger.js';
import { confirm } from '../utils/prompts.js';
import { getConfigPaths, ensureDir } from '../lib/paths.js';
import {
  createMetaJson,
  writeMetaJson,
} from '../lib/sync.js';
import { setupGitSync } from '../lib/sync-setup.js';
import { printLogo } from '../utils/logo.js';

export const initCommand = new Command('init')
  .description('Initialize Jean-Claude on this machine')
  .option('--sync', 'Set up Git-based syncing without prompting')
  .option('--no-sync', 'Skip Git sync setup without prompting')
  .action(async (options: { sync?: boolean }) => {
    const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

    printLogo();
    logger.heading('Setup');

    // Check if already initialized
    const metaPath = path.join(jeanClaudeDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      logger.success(`Already initialized at ${formatPath(jeanClaudeDir)}`);
      logger.dim('Run "jean-claude sync status" to see current state.');
      return;
    }

    // Create the jean-claude directory and meta.json
    ensureDir(jeanClaudeDir);
    const meta = createMetaJson(claudeConfigDir);
    await writeMetaJson(jeanClaudeDir, meta);

    // Check for existing git repo (partial init recovery)
    const gitDir = path.join(jeanClaudeDir, '.git');
    if (fs.existsSync(gitDir)) {
      logger.info('Found existing Git repository — reusing it.');
    }

    // Ask about syncing (unless --sync or --no-sync was provided)
    let wantSync: boolean;
    if (options.sync !== undefined) {
      wantSync = options.sync;
    } else {
      console.log('');
      wantSync = await confirm('Would you like to set up syncing with a Git remote?');
    }

    if (wantSync) {
      await setupGitSync(jeanClaudeDir);
    }

    // Done
    console.log('');
    logger.success('Jean-Claude is installed!');
    console.log('');
    logger.dim('Next steps:');

    if (wantSync) {
      logger.list([
        'Run "jean-claude profile create <name>" to create a profile',
        'Run "jean-claude sync push" to push your config to Git',
        'Run "jean-claude sync pull" on other machines to sync',
      ]);
    } else {
      logger.list([
        'Run "jean-claude profile create <name>" to create a profile',
        'Run "jean-claude sync setup" to configure syncing later',
      ]);
    }
  });
