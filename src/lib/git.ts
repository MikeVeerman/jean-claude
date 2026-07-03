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

/**
 * Pull from the upstream tracking branch, rebasing local commits on top of it.
 *
 * A plain `git pull` refuses to integrate when local and remote history have
 * diverged (`fatal: Need to specify how to reconcile divergent branches`),
 * which happens routinely when two machines sync without pulling in between.
 * Rebasing keeps the history linear. Divergence that conflicts only on
 * `meta.json` (per-machine metadata that is regenerated on every sync) is
 * resolved automatically: `--ours` during a rebase is the upstream side, so
 * the remote copy is kept — which side wins is immaterial since it is
 * rewritten on the next sync. Any other conflict aborts the rebase and is
 * surfaced to the caller.
 */
async function pullWithRebase(git: SimpleGit): Promise<void> {
  try {
    await git.pull(['--rebase']);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('CONFLICT') || errMsg.includes('conflict')) {
      const conflictStatus = await git.status();
      const conflictFiles = conflictStatus.conflicted;
      if (conflictFiles.length === 1 && conflictFiles[0] === 'meta.json') {
        await git.checkout(['--ours', 'meta.json']);
        await git.add('meta.json');
        await git.env('GIT_EDITOR', 'true').rebase(['--continue']);
        return;
      }
      await git.rebase(['--abort']);
    }
    throw err;
  }
}

export async function pull(dir: string): Promise<{ success: boolean; message: string }> {
  const git = createGit(dir);

  try {
    const before = await git.revparse(['HEAD']);
    await pullWithRebase(git);
    const after = await git.revparse(['HEAD']);

    if (before === after) {
      return { success: true, message: 'Already up to date.' };
    }

    const diff = await git.diffSummary([`${before}..${after}`]);
    return {
      success: true,
      message: `Updated: ${diff.insertions} insertions, ${diff.deletions} deletions`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('CONFLICT') || message.includes('conflict')) {
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
      // Only pull --rebase if we have an upstream tracking branch
      if (status.tracking) {
        try {
          await pullWithRebase(git);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes('CONFLICT') || errMsg.includes('conflict')) {
            throw new JeanClaudeError(
              `Rebase failed due to conflicts: ${errMsg}`,
              ErrorCode.MERGE_CONFLICT,
              'Try running "jean-claude sync pull" to resolve conflicts.'
            );
          } else if (errMsg.includes('no such ref') || errMsg.includes("Couldn't find remote ref")) {
            // Remote branch doesn't exist yet — skip rebase, first push will create it
          } else {
            throw new JeanClaudeError(
              `Pull --rebase failed: ${errMsg}`,
              ErrorCode.NETWORK_ERROR,
              'Check your network connection and try again.'
            );
          }
        }
      }

      try {
        // Use -u to set upstream on first push
        await git.push(['-u', 'origin', 'HEAD']);
        return { committed: true, pushed: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new JeanClaudeError(
          `Push failed: ${errMsg}`,
          ErrorCode.NETWORK_ERROR,
          'Check your network connection and try again.'
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
