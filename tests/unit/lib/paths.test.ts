import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import { expandPath, contractPath } from '../../../src/lib/paths.js';

describe('paths.ts', () => {
  const home = '/Users/testuser';

  beforeEach(() => {
    vi.spyOn(os, 'homedir').mockReturnValue(home);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('expandPath', () => {
    it('should expand ~/ to the home directory', () => {
      expect(expandPath('~/.claude-work')).toBe('/Users/testuser/.claude-work');
      expect(expandPath('~/a/b/c')).toBe('/Users/testuser/a/b/c');
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
    it('should replace the home directory prefix with ~', () => {
      expect(contractPath('/Users/testuser/.claude-work')).toBe('~/.claude-work');
    });

    it('should contract an exact home directory match to ~', () => {
      expect(contractPath(home)).toBe('~');
    });

    it('should not contract sibling directories sharing the home prefix', () => {
      // /Users/testusershared starts with the home string but is a different dir;
      // contracting it to ~shared/... would not survive expandPath.
      expect(contractPath('/Users/testusershared/x')).toBe('/Users/testusershared/x');
    });

    it('should pass through paths outside the home directory', () => {
      expect(contractPath('/var/log/test.log')).toBe('/var/log/test.log');
    });

    it('should pass through falsy input unchanged', () => {
      expect(contractPath('')).toBe('');
    });

    it('should be idempotent', () => {
      const contracted = contractPath('/Users/testuser/.claude-work');
      expect(contractPath(contracted)).toBe(contracted);
    });
  });

  describe('round-trip', () => {
    it('should restore the original absolute path', () => {
      const paths = [
        '/Users/testuser/.claude-work',
        home,
        '/Users/testusershared/x',
        '/var/log/test.log',
      ];
      for (const p of paths) {
        expect(expandPath(contractPath(p))).toBe(p);
      }
    });
  });
});
