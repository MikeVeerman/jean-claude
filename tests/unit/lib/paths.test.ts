import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import { expandPath, contractPath } from '../../../src/lib/paths.js';

describe('paths.ts', () => {
  // Platform-native home so path.join-built paths match on every OS
  const home =
    process.platform === 'win32' ? 'C:\\Users\\testuser' : '/Users/testuser';

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(home);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('expandPath', () => {
    it('should expand ~/ to the home directory', () => {
      // path.join produces platform-native separators
      expect(expandPath('~/.claude-work')).toBe(path.join(home, '.claude-work'));
      expect(expandPath('~/a/b/c')).toBe(path.join(home, 'a/b/c'));
    });

    it('should expand ~\\ (Windows-style) to the home directory', () => {
      // Config files written by older Windows versions may contain ~\
      expect(expandPath('~\\.claude-work')).toBe(path.join(home, '.claude-work'));
    });

    it('should expand a bare ~ to the home directory', () => {
      expect(expandPath('~')).toBe(home);
    });

    it('should pass through absolute paths unchanged', () => {
      expect(expandPath('/var/log/test.log')).toBe('/var/log/test.log');
      expect(expandPath(home)).toBe(home);
    });

    it('should not expand ~username-style paths', () => {
      expect(expandPath('~other/dir')).toBe('~other/dir');
    });

    it('should pass through falsy input unchanged', () => {
      expect(expandPath('')).toBe('');
      // Old meta.json files may lack claudeConfigPath entirely
      expect(expandPath(undefined as unknown as string)).toBeUndefined();
    });

    it('should be idempotent', () => {
      const expanded = expandPath('~/.claude-work');
      expect(expandPath(expanded)).toBe(expanded);
    });
  });

  describe('contractPath', () => {
    it('should replace the home directory prefix with a portable ~/', () => {
      // Even on Windows (backslash paths) the contracted form uses forward
      // slashes so it expands correctly on any other machine
      expect(contractPath(path.join(home, '.claude-work'))).toBe('~/.claude-work');
      expect(contractPath(path.join(home, 'a', 'b'))).toBe('~/a/b');
    });

    it('should contract an exact home directory match to ~', () => {
      expect(contractPath(home)).toBe('~');
    });

    it('should not contract sibling directories sharing the home prefix', () => {
      // <home>shared starts with the home string but is a different dir;
      // contracting it to ~shared/... would not survive expandPath.
      const sibling = home + 'shared' + path.sep + 'x';
      expect(contractPath(sibling)).toBe(sibling);
    });

    it('should pass through paths outside the home directory', () => {
      expect(contractPath('/var/log/test.log')).toBe('/var/log/test.log');
    });

    it('should pass through falsy input unchanged', () => {
      expect(contractPath('')).toBe('');
    });

    it('should be idempotent', () => {
      const contracted = contractPath(path.join(home, '.claude-work'));
      expect(contractPath(contracted)).toBe(contracted);
    });
  });

  describe('round-trip', () => {
    it('should restore the original absolute path', () => {
      const paths = [
        path.join(home, '.claude-work'),
        home,
        home + 'shared' + path.sep + 'x',
        '/var/log/test.log',
      ];
      for (const p of paths) {
        expect(expandPath(contractPath(p))).toBe(p);
      }
    });
  });
});
