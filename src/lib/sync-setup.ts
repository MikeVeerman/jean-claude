import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { confirm, input } from '../utils/prompts.js';
import { isGitRepo, createGit, initRepo, addRemote, testRemoteConnection, cloneRepo } from './git.js';
import { readMetaJson } from './sync.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

async function warnIfNotJeanClaudeRepo(dir: string): Promise<void> {
  const meta = await readMetaJson(dir);
  if (meta?.managedBy === 'jean-claude') return;

  logger.warn('This repository does not appear to be a Jean-Claude config repo.');
  logger.dim('It may overwrite your Claude Code configuration with unrelated files.');
  const proceed = await confirm('Continue anyway?', false);
  if (!proceed) {
    throw new JeanClaudeError(
      'Setup cancelled — repository validation failed',
      ErrorCode.INVALID_CONFIG,
      'Use a repository created by "jean-claude init" with syncing enabled.'
    );
  }
}

/**
 * Interactive Git remote setup flow.
 * Used by both `jean-claude init` (when user opts in) and `jean-claude sync setup`.
 */
export async function setupGitSync(jeanClaudeDir: string, urlArg?: string): Promise<void> {
  const isRepo = await isGitRepo(jeanClaudeDir);

  if (isRepo) {
    // Already a git repo — check if remote is configured
    const git = createGit(jeanClaudeDir);
    const remotes = await git.getRemotes(true);
    if (remotes.length > 0) {
      const origin = remotes.find(r => r.name === 'origin');
      const currentUrl = origin?.refs?.fetch || 'unknown';

      logger.success('Syncing is already configured.');
      logger.dim(`Current remote: ${currentUrl}`);

      if (!urlArg) {
        return;
      }

      const newUrl = urlArg.trim();
      if (newUrl && newUrl !== currentUrl) {
        await git.remote(['set-url', 'origin', newUrl]);
        logger.success('Remote URL updated.');
      } else {
        logger.dim('Remote URL unchanged.');
      }
      return;
    }
  }

  let repoUrl = urlArg;
  if (!repoUrl) {
    // Explain what's needed
    console.log('');
    logger.dim('Paste the URL of your existing config repo, or create a new');
    logger.dim('empty repo (e.g. "my-claude-config") on GitHub/GitLab.');
    console.log('');

    repoUrl = await input('Repository URL:');
  }

  if (!repoUrl.trim()) {
    throw new JeanClaudeError(
      'No repository URL provided',
      ErrorCode.INVALID_CONFIG,
      'Provide a Git repository URL (e.g. git@github.com:user/repo.git).'
    );
  }

  // Test connection to remote
  logger.step(1, 2, 'Testing connection to repository...');
  const canConnect = await testRemoteConnection(repoUrl);
  if (!canConnect) {
    throw new JeanClaudeError(
      'Cannot connect to repository',
      ErrorCode.NETWORK_ERROR,
      'Check that the URL is correct and you have access.'
    );
  }
  logger.success('Connection successful');

  // Set up the git repo
  logger.step(2, 2, 'Setting up local repository...');

  if (isRepo) {
    // Already a git repo but no remote — just add the remote
    await addRemote(jeanClaudeDir, repoUrl);
    logger.success('Remote added to existing repository');
  } else {
    // Not a git repo — need to set up git
    const dirContents = await fs.readdir(jeanClaudeDir);

    if (dirContents.length === 0) {
      // Empty directory — clone directly
      try {
        await cloneRepo(repoUrl, jeanClaudeDir);
        const cloneGit = createGit(jeanClaudeDir);
        const hasCommits = await cloneGit.log().then(log => log.total > 0).catch(() => false);
        if (hasCommits) {
          await warnIfNotJeanClaudeRepo(jeanClaudeDir);
          logger.success('Cloned existing config from repository');
        } else {
          logger.success('Initialized new repository');
        }
      } catch (error) {
        if (error instanceof JeanClaudeError && error.code !== ErrorCode.CLONE_FAILED) throw error;
        await initRepo(jeanClaudeDir);
        await addRemote(jeanClaudeDir, repoUrl);
        logger.success('Initialized new repository');
      }
    } else {
      // Non-empty directory (e.g. has meta.json) — clone to temp, move .git over
      const tmpDir = path.join(os.tmpdir(), `jean-claude-clone-${Date.now()}`);
      try {
        await cloneRepo(repoUrl, tmpDir);
        const tmpGit = createGit(tmpDir);
        const hasCommits = await tmpGit.log().then(log => log.total > 0).catch(() => false);
        if (hasCommits) {
          await warnIfNotJeanClaudeRepo(tmpDir);
          await fs.move(path.join(tmpDir, '.git'), path.join(jeanClaudeDir, '.git'));
          const git = createGit(jeanClaudeDir);
          await git.reset(['HEAD']);
          logger.success('Cloned existing config from repository');
        } else {
          // Empty remote — take the .git (has origin configured), skip reset
          await fs.move(path.join(tmpDir, '.git'), path.join(jeanClaudeDir, '.git'));
          logger.success('Initialized new repository');
        }
      } catch (error) {
        if (error instanceof JeanClaudeError && error.code !== ErrorCode.CLONE_FAILED) throw error;
        await initRepo(jeanClaudeDir);
        await addRemote(jeanClaudeDir, repoUrl);
        logger.success('Initialized new repository');
      } finally {
        await fs.remove(tmpDir);
      }
    }
  }
}
