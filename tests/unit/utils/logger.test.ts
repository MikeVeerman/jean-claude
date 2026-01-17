import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatPath } from '../../../src/utils/logger.js';
import os from 'os';
import path from 'path';

describe('logger.ts', () => {
  describe('formatPath', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let homeDir: string;

    beforeEach(() => {
      originalEnv = { ...process.env };
      homeDir = os.homedir();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should replace home directory with ~', () => {
      const testPath = path.join(homeDir, 'documents', 'test.txt');
      const formatted = formatPath(testPath);

      expect(formatted).toBe(path.join('~', 'documents', 'test.txt'));
    });

    it('should not modify paths outside home directory', () => {
      const testPath = '/var/log/test.log';
      const formatted = formatPath(testPath);

      expect(formatted).toBe('/var/log/test.log');
    });

    it('should handle home directory exact match', () => {
      const formatted = formatPath(homeDir);

      expect(formatted).toBe('~');
    });

    it('should handle paths with trailing slashes', () => {
      const testPath = path.join(homeDir, 'documents', 'folder') + path.sep;
      const formatted = formatPath(testPath);

      expect(formatted.startsWith('~')).toBe(true);
    });

    it('should handle empty string', () => {
      const formatted = formatPath('');
      expect(formatted).toBe('');
    });

    it('should handle relative paths', () => {
      const testPath = './relative/path';
      const formatted = formatPath(testPath);

      expect(formatted).toBe('./relative/path');
    });
  });
});
