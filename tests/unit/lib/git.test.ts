import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { simpleGit } from 'simple-git';
import { commitAndPush } from '../../../src/lib/git.js';

describe('git.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-git-test-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('commitAndPush', () => {
    it('should return committed:false, pushed:false when nothing to commit', async () => {
      const localDir = path.join(tempDir, 'local');
      await fs.ensureDir(localDir);

      const git = simpleGit(localDir);
      await git.init();
      await git.addConfig('user.email', 'test@test.com');
      await git.addConfig('user.name', 'Test');

      // Create an initial commit so the repo is not empty
      await fs.writeFile(path.join(localDir, 'init.txt'), 'init');
      await git.add('-A');
      await git.commit('initial commit');

      const result = await commitAndPush(localDir, 'nothing to commit', false);
      expect(result).toEqual({ committed: false, pushed: false });
    });

    it('should commit but not push when push=false', async () => {
      const localDir = path.join(tempDir, 'local');
      await fs.ensureDir(localDir);

      const git = simpleGit(localDir);
      await git.init();
      await git.addConfig('user.email', 'test@test.com');
      await git.addConfig('user.name', 'Test');

      await fs.writeFile(path.join(localDir, 'init.txt'), 'init');
      await git.add('-A');
      await git.commit('initial commit');

      // Create a new file to commit
      await fs.writeFile(path.join(localDir, 'file.txt'), 'hello');

      const result = await commitAndPush(localDir, 'add file', false);
      expect(result).toEqual({ committed: true, pushed: false });

      // Verify the commit was actually made
      const log = await git.log();
      expect(log.latest?.message).toBe('add file');
    });

    it('should skip pull --rebase when there is no upstream tracking branch (#36)', async () => {
      // Create a local repo
      const localDir = path.join(tempDir, 'local');
      await fs.ensureDir(localDir);

      const git = simpleGit(localDir);
      await git.init();
      await git.addConfig('user.email', 'test@test.com');
      await git.addConfig('user.name', 'Test');

      await fs.writeFile(path.join(localDir, 'init.txt'), 'init');
      await git.add('-A');
      await git.commit('initial commit');

      // Create a bare remote
      const bareDir = path.join(tempDir, 'remote.git');
      await simpleGit().clone(localDir, bareDir, ['--bare']);

      // Add the remote to local but do NOT set up tracking
      // First remove origin if it exists, then add bare as origin
      try { await git.removeRemote('origin'); } catch { /* ignore */ }
      await git.addRemote('origin', bareDir);

      // Create a new file to commit — no tracking branch exists yet
      await fs.writeFile(path.join(localDir, 'newfile.txt'), 'content');

      // This should succeed: skip pull --rebase, push with -u
      const result = await commitAndPush(localDir, 'first push no upstream');
      expect(result).toEqual({ committed: true, pushed: true });

      // Verify the commit landed on the remote
      const bareGit = simpleGit(bareDir);
      const log = await bareGit.log();
      expect(log.latest?.message).toBe('first push no upstream');
    });

    it('should pull --rebase before push when upstream tracking branch exists (#22)', async () => {
      // Simulate two machines sharing a bare remote
      const machine1Dir = path.join(tempDir, 'machine1');
      const machine2Dir = path.join(tempDir, 'machine2');
      const bareDir = path.join(tempDir, 'remote.git');

      // Set up machine1 with initial commit
      await fs.ensureDir(machine1Dir);
      const git1 = simpleGit(machine1Dir);
      await git1.init();
      await git1.addConfig('user.email', 'test@test.com');
      await git1.addConfig('user.name', 'Test');
      await fs.writeFile(path.join(machine1Dir, 'init.txt'), 'init');
      await git1.add('-A');
      await git1.commit('initial commit');

      // Create bare remote from machine1
      await simpleGit().clone(machine1Dir, bareDir, ['--bare']);

      // Set up machine1 to track the remote
      try { await git1.removeRemote('origin'); } catch { /* ignore */ }
      await git1.addRemote('origin', bareDir);
      await git1.push(['-u', 'origin', 'HEAD']);

      // Clone to machine2
      await simpleGit().clone(bareDir, machine2Dir);
      const git2 = simpleGit(machine2Dir);
      await git2.addConfig('user.email', 'test@test.com');
      await git2.addConfig('user.name', 'Test');

      // Machine2 makes a commit and pushes directly
      await fs.writeFile(path.join(machine2Dir, 'machine2.txt'), 'from machine 2');
      await git2.add('-A');
      await git2.commit('machine2 commit');
      await git2.push();

      // Machine1 makes a different commit (different file to avoid conflicts)
      await fs.writeFile(path.join(machine1Dir, 'machine1.txt'), 'from machine 1');

      // commitAndPush on machine1 should pull --rebase (integrating machine2's commit) then push
      const result = await commitAndPush(machine1Dir, 'machine1 commit');
      expect(result).toEqual({ committed: true, pushed: true });

      // Verify both commits are in the remote
      const bareGit = simpleGit(bareDir);
      const log = await bareGit.log();
      const messages = log.all.map((c) => c.message);
      expect(messages).toContain('machine1 commit');
      expect(messages).toContain('machine2 commit');
    });
  });
});
