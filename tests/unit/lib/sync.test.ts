import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  compareFiles,
  createMetaJson,
  readMetaJson,
  writeMetaJson,
  updateLastSync,
  syncFromClaudeConfig,
  syncToClaudeConfig,
} from '../../../src/lib/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('sync.ts', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jean-claude-test-'));
  });

  afterEach(async () => {
    // Clean up
    await fs.remove(tempDir);
  });

  describe('compareFiles', () => {
    it('should return comparison results for all file mappings', () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = compareFiles(sourceDir, targetDir);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result).toHaveProperty('mapping');
        expect(result).toHaveProperty('inSync');
        expect(result).toHaveProperty('sourceExists');
        expect(result).toHaveProperty('targetExists');
      });
    });

    it('should detect when files are missing in both locations', () => {
      const sourceDir = path.join(tempDir, 'source');
      const targetDir = path.join(tempDir, 'target');

      const results = compareFiles(sourceDir, targetDir);

      // All files should be missing and considered in sync
      results.forEach(result => {
        expect(result.sourceExists).toBe(false);
        expect(result.targetExists).toBe(false);
        expect(result.inSync).toBe(true);
      });
    });
  });

  describe('metadata operations', () => {
    describe('createMetaJson', () => {
      it('should create valid metadata', () => {
        const claudeConfigPath = '/home/user/.claude';
        const meta = createMetaJson(claudeConfigPath);

        expect(meta).toHaveProperty('version');
        expect(meta).toHaveProperty('lastSync');
        expect(meta).toHaveProperty('machineId');
        expect(meta).toHaveProperty('platform');
        expect(meta).toHaveProperty('claudeConfigPath');

        expect(meta.version).toBe('1.0.0');
        expect(meta.lastSync).toBeNull();
        expect(meta.claudeConfigPath).toBe(claudeConfigPath);
        expect(meta.machineId).toContain('-'); // Format: hostname-hash
        expect(['linux', 'darwin']).toContain(meta.platform);
      });

      it('should generate consistent machineId for same hostname', () => {
        const meta1 = createMetaJson('/test/path');
        const meta2 = createMetaJson('/test/path');

        // Should be the same since hostname and platform are the same
        expect(meta1.machineId).toBe(meta2.machineId);
      });
    });

    describe('writeMetaJson and readMetaJson', () => {
      it('should write and read metadata correctly', async () => {
        const meta = createMetaJson('/test/path');
        const jeanClaudeDir = path.join(tempDir, '.jean-claude');
        await fs.ensureDir(jeanClaudeDir);

        await writeMetaJson(jeanClaudeDir, meta);

        const metaPath = path.join(jeanClaudeDir, 'meta.json');
        expect(await fs.pathExists(metaPath)).toBe(true);

        const readMeta = await readMetaJson(jeanClaudeDir);
        expect(readMeta).toEqual(meta);
      });

      it('should return null when meta.json does not exist', async () => {
        const jeanClaudeDir = path.join(tempDir, '.jean-claude');
        await fs.ensureDir(jeanClaudeDir);

        const meta = await readMetaJson(jeanClaudeDir);
        expect(meta).toBeNull();
      });
    });

    describe('updateLastSync', () => {
      it('should update the lastSync timestamp', async () => {
        const meta = createMetaJson('/test/path');
        const jeanClaudeDir = path.join(tempDir, '.jean-claude');
        await fs.ensureDir(jeanClaudeDir);
        await writeMetaJson(jeanClaudeDir, meta);

        expect(meta.lastSync).toBeNull();

        await updateLastSync(jeanClaudeDir);

        const updatedMeta = await readMetaJson(jeanClaudeDir);
        expect(updatedMeta?.lastSync).not.toBeNull();
        if (updatedMeta?.lastSync) {
          expect(new Date(updatedMeta.lastSync).getTime()).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('syncFromClaudeConfig', () => {
    it('should copy files from Claude config to jean-claude repo', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const jeanClaudeDir = path.join(tempDir, '.jean-claude');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(jeanClaudeDir);

      // Create test files
      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Instructions');
      await fs.writeFile(path.join(claudeDir, 'settings.json'), '{"theme":"dark"}');

      const results = await syncFromClaudeConfig(claudeDir, jeanClaudeDir);

      // Should have synced files
      expect(results.length).toBeGreaterThan(0);
      expect(await fs.pathExists(path.join(jeanClaudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(path.join(jeanClaudeDir, 'settings.json'))).toBe(true);

      const claudeMd = await fs.readFile(path.join(jeanClaudeDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# Instructions');
    });

    it('should sync hooks directory', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const jeanClaudeDir = path.join(tempDir, '.jean-claude');

      await fs.ensureDir(path.join(claudeDir, 'hooks'));
      await fs.ensureDir(jeanClaudeDir);

      await fs.writeFile(path.join(claudeDir, 'hooks', 'test.sh'), '#!/bin/bash\necho "test"');

      const results = await syncFromClaudeConfig(claudeDir, jeanClaudeDir);

      expect(await fs.pathExists(path.join(jeanClaudeDir, 'hooks', 'test.sh'))).toBe(true);
    });
  });

  describe('syncToClaudeConfig', () => {
    it('should copy files from jean-claude repo to Claude config', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const jeanClaudeDir = path.join(tempDir, '.jean-claude');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(jeanClaudeDir);

      await fs.writeFile(path.join(jeanClaudeDir, 'CLAUDE.md'), '# Remote Instructions');
      await fs.writeFile(path.join(jeanClaudeDir, 'settings.json'), '{"theme":"light"}');

      const results = await syncToClaudeConfig(jeanClaudeDir, claudeDir);

      expect(await fs.pathExists(path.join(claudeDir, 'CLAUDE.md'))).toBe(true);
      expect(await fs.pathExists(path.join(claudeDir, 'settings.json'))).toBe(true);

      const claudeMd = await fs.readFile(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# Remote Instructions');
    });

    it('should overwrite existing files', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      const jeanClaudeDir = path.join(tempDir, '.jean-claude');

      await fs.ensureDir(claudeDir);
      await fs.ensureDir(jeanClaudeDir);

      await fs.writeFile(path.join(claudeDir, 'CLAUDE.md'), '# Old');
      await fs.writeFile(path.join(jeanClaudeDir, 'CLAUDE.md'), '# New');

      await syncToClaudeConfig(jeanClaudeDir, claudeDir);

      const claudeMd = await fs.readFile(path.join(claudeDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeMd).toBe('# New');
    });
  });
});
