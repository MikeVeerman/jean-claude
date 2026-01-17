import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import type { GitStatus } from '../types/index.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

export function createGit(baseDir: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir,
    binary: 'git',
    maxConcurrentProcesses: 6,
  };
  return simpleGit(options);
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const git = createGit(dir);
    return await git.checkIsRepo();
  } catch {
    return false;
  }
}

export async function cloneRepo(url: string, targetDir: string): Promise<void> {
  try {
    const git = simpleGit();
    await git.clone(url, targetDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new JeanClaudeError(
      `Failed to clone repository: ${message}`,
      ErrorCode.CLONE_FAILED,
      'Check that the URL is correct and you have access to the repository.'
    );
  }
}

export async function testRemoteConnection(url: string): Promise<boolean> {
  try {
    const git = simpleGit();
    await git.listRemote([url]);
    return true;
  } catch {
    return false;
  }
}

export async function initRepo(dir: string): Promise<void> {
  const git = createGit(dir);
  await git.init();
}

export async function resetHard(dir: string): Promise<void> {
  const git = createGit(dir);
  await git.reset(['--hard', 'HEAD']);
}

export async function cleanUntracked(dir: string): Promise<void> {
  const git = createGit(dir);
  await git.clean('f', ['-d']);
}

export async function getGitStatus(dir: string): Promise<GitStatus> {
  const git = createGit(dir);

  const isRepo = await isGitRepo(dir);
  if (!isRepo) {
    return {
      isRepo: false,
      isClean: false,
      branch: null,
      remote: null,
      ahead: 0,
      behind: 0,
      modified: [],
      untracked: [],
    };
  }

  const status = await git.status();
  const remotes = await git.getRemotes(true);
  const originRemote = remotes.find((r) => r.name === 'origin');

  return {
    isRepo: true,
    isClean: status.isClean(),
    branch: status.current,
    remote: originRemote?.refs?.fetch || null,
    ahead: status.ahead,
    behind: status.behind,
    modified: [...status.modified, ...status.staged],
    untracked: status.not_added,
  };
}

export async function pull(dir: string): Promise<{ success: boolean; message: string }> {
  const git = createGit(dir);

  try {
    const result = await git.pull();
    if (result.summary.changes === 0) {
      return { success: true, message: 'Already up to date.' };
    }
    return {
      success: true,
      message: `Updated: ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('CONFLICT')) {
      throw new JeanClaudeError(
        'Merge conflict detected',
        ErrorCode.MERGE_CONFLICT,
        `Resolve conflicts manually in ${dir} and try again.`
      );
    }
    throw new JeanClaudeError(
      `Git pull failed: ${message}`,
      ErrorCode.NETWORK_ERROR
    );
  }
}

export async function commitAndPush(
  dir: string,
  message: string,
  push: boolean = true
): Promise<{ committed: boolean; pushed: boolean }> {
  const git = createGit(dir);

  // Stage all changes
  await git.add('-A');

  // Check if there's anything to commit
  const status = await git.status();
  if (status.isClean()) {
    return { committed: false, pushed: false };
  }

  // Commit
  await git.commit(message);

  // Push if requested and remote exists
  if (push) {
    const remotes = await git.getRemotes();
    if (remotes.length > 0) {
      try {
        await git.push();
        return { committed: true, pushed: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new JeanClaudeError(
          `Push failed: ${errMsg}`,
          ErrorCode.NETWORK_ERROR,
          'Try running "git push" manually to see the full error.'
        );
      }
    }
  }

  return { committed: true, pushed: false };
}

export async function hasMergeConflicts(dir: string): Promise<boolean> {
  const git = createGit(dir);
  const status = await git.status();
  return status.conflicted.length > 0;
}

export async function addRemote(dir: string, url: string): Promise<void> {
  const git = createGit(dir);
  await git.addRemote('origin', url);
}

export async function getDiff(dir: string): Promise<string> {
  const git = createGit(dir);
  return await git.diff();
}
