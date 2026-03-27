import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { input } from '../utils/prompts.js';
import { isGitRepo, createGit, initRepo, addRemote, testRemoteConnection, cloneRepo } from './git.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

/**
 * Interactive Git remote setup flow.
 * Used by both `jean-claude init` (when user opts in) and `jean-claude sync setup`.
 */
export async function setupGitSync(jeanClaudeDir: string): Promise<void> {
  const isRepo = await isGitRepo(jeanClaudeDir);

  if (isRepo) {
    // Already a git repo — check if remote is configured
    const git = createGit(jeanClaudeDir);
    const remotes = await git.getRemotes();
    if (remotes.length > 0) {
      logger.success('Syncing is already configured.');
      return;
    }
  }

  // Explain what's needed
  console.log('');
  logger.dim('Paste the URL of your existing config repo, or create a new');
  logger.dim('empty repo (e.g. "my-claude-config") on GitHub/GitLab.');
  console.log('');

  // Get repository URL
  const repoUrl = await input('Repository URL:');

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
        logger.success('Cloned existing config from repository');
      } catch {
        await initRepo(jeanClaudeDir);
        await addRemote(jeanClaudeDir, repoUrl);
        logger.success('Initialized new repository');
      }
    } else {
      // Non-empty directory (e.g. has meta.json) — clone to temp, move .git over
      const tmpDir = path.join(os.tmpdir(), `jean-claude-clone-${Date.now()}`);
      try {
        await cloneRepo(repoUrl, tmpDir);
        // Move .git from clone into our directory
        await fs.move(path.join(tmpDir, '.git'), path.join(jeanClaudeDir, '.git'));
        // Reset to match working tree (our existing files take priority)
        const git = createGit(jeanClaudeDir);
        await git.reset(['HEAD']);
        logger.success('Cloned existing config from repository');
      } catch {
        // Remote is empty — just init locally
        await initRepo(jeanClaudeDir);
        await addRemote(jeanClaudeDir, repoUrl);
        logger.success('Initialized new repository');
      } finally {
        await fs.remove(tmpDir);
      }
    }
  }
}
