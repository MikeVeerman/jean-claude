import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import type { FileMapping, SyncResult, MetaJson } from '../types/index.js';
import { getConfigPaths } from './paths.js';

export const FILE_MAPPINGS: FileMapping[] = [
  {
    source: 'CLAUDE.md',
    target: 'CLAUDE.md',
    type: 'file',
  },
  {
    source: 'settings.json',
    target: 'settings.json',
    type: 'file',
  },
  {
    source: 'hooks',
    target: 'hooks',
    type: 'directory',
  },
  {
    source: 'skills',
    target: 'skills',
    type: 'directory',
  },
];

function fileHash(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

export function compareFiles(
  sourceDir: string,
  targetDir: string
): Array<{ mapping: FileMapping; inSync: boolean; sourceExists: boolean; targetExists: boolean }> {
  return FILE_MAPPINGS.map((mapping) => {
    const sourcePath = path.join(sourceDir, mapping.source);
    const targetPath = path.join(targetDir, mapping.target);

    const sourceExists = fs.existsSync(sourcePath);
    const targetExists = fs.existsSync(targetPath);

    if (!sourceExists && !targetExists) {
      return { mapping, inSync: true, sourceExists, targetExists };
    }

    if (!sourceExists || !targetExists) {
      return { mapping, inSync: false, sourceExists, targetExists };
    }

    if (mapping.type === 'directory') {
      // For directories, do a simple existence check
      return { mapping, inSync: true, sourceExists, targetExists };
    }

    const sourceHash = fileHash(sourcePath);
    const targetHash = fileHash(targetPath);

    return {
      mapping,
      inSync: sourceHash === targetHash,
      sourceExists,
      targetExists,
    };
  });
}

async function listFilesRecursive(dir: string, base: string = ''): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(path.join(dir, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

export async function syncToClaudeConfig(
  jeanClaudeDir: string,
  claudeConfigDir: string,
  dryRun = false
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  // Ensure target directory exists
  if (!dryRun) {
    await fs.ensureDir(claudeConfigDir);
  }

  for (const mapping of FILE_MAPPINGS) {
    const sourcePath = path.join(jeanClaudeDir, mapping.source);
    const targetPath = path.join(claudeConfigDir, mapping.target);

    if (!fs.existsSync(sourcePath)) {
      results.push({
        file: mapping.source,
        action: 'skipped',
        source: sourcePath,
        target: targetPath,
      });
      continue;
    }

    if (mapping.type === 'directory') {
      // List individual files in directory
      const files = await listFilesRecursive(sourcePath);
      if (!dryRun) {
        await fs.copy(sourcePath, targetPath, { overwrite: true });
      }
      for (const file of files) {
        const fileTargetPath = path.join(targetPath, file);
        const fileExists = fs.existsSync(fileTargetPath);
        results.push({
          file: `${mapping.source}/${file}`,
          action: fileExists ? 'updated' : 'created',
          source: path.join(sourcePath, file),
          target: fileTargetPath,
        });
      }
    } else {
      const targetExists = fs.existsSync(targetPath);
      if (!dryRun) {
        await fs.copy(sourcePath, targetPath);
      }
      results.push({
        file: mapping.source,
        action: targetExists ? 'updated' : 'created',
        source: sourcePath,
        target: targetPath,
      });
    }
  }

  return results;
}

export async function importFromClaudeConfig(
  claudeConfigDir: string,
  jeanClaudeDir: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const mapping of FILE_MAPPINGS) {
    const sourcePath = path.join(claudeConfigDir, mapping.target);
    const targetPath = path.join(jeanClaudeDir, mapping.source);

    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const targetExists = fs.existsSync(targetPath);

    if (mapping.type === 'directory') {
      await fs.copy(sourcePath, targetPath, { overwrite: true });
    } else {
      await fs.copy(sourcePath, targetPath);
    }

    results.push({
      file: mapping.target,
      action: targetExists ? 'updated' : 'copied',
      source: sourcePath,
      target: targetPath,
    });
  }

  return results;
}

export async function syncFromClaudeConfig(
  claudeConfigDir: string,
  jeanClaudeDir: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const mapping of FILE_MAPPINGS) {
    const sourcePath = path.join(claudeConfigDir, mapping.target);
    const targetPath = path.join(jeanClaudeDir, mapping.source);

    if (!fs.existsSync(sourcePath)) {
      // Source doesn't exist - remove target if it exists
      if (fs.existsSync(targetPath)) {
        await fs.remove(targetPath);
        results.push({
          file: mapping.source,
          action: 'deleted',
          source: sourcePath,
          target: targetPath,
        });
      } else {
        results.push({
          file: mapping.source,
          action: 'skipped',
          source: sourcePath,
          target: targetPath,
        });
      }
      continue;
    }

    const targetExists = fs.existsSync(targetPath);

    if (mapping.type === 'directory') {
      // For directories, remove target first to ensure exact mirror
      if (targetExists) {
        await fs.remove(targetPath);
      }
      await fs.copy(sourcePath, targetPath);
    } else {
      await fs.copy(sourcePath, targetPath);
    }

    results.push({
      file: mapping.source,
      action: targetExists ? 'updated' : 'copied',
      source: sourcePath,
      target: targetPath,
    });
  }

  return results;
}

export function createMetaJson(claudeConfigPath: string): MetaJson {
  const { platform } = getConfigPaths();
  const hostname = os.hostname();
  const machineId = crypto
    .createHash('md5')
    .update(hostname + platform)
    .digest('hex')
    .slice(0, 8);

  return {
    version: '1.0.0',
    lastSync: null,
    machineId: `${hostname}-${machineId}`,
    platform,
    claudeConfigPath,
  };
}

export async function readMetaJson(jeanClaudeDir: string): Promise<MetaJson | null> {
  const metaPath = path.join(jeanClaudeDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  try {
    return await fs.readJson(metaPath);
  } catch {
    return null;
  }
}

export async function writeMetaJson(
  jeanClaudeDir: string,
  meta: MetaJson
): Promise<void> {
  const metaPath = path.join(jeanClaudeDir, 'meta.json');
  await fs.writeJson(metaPath, meta, { spaces: 2 });
}

export async function updateLastSync(jeanClaudeDir: string): Promise<void> {
  const meta = await readMetaJson(jeanClaudeDir);
  if (meta) {
    meta.lastSync = new Date().toISOString();
    await writeMetaJson(jeanClaudeDir, meta);
  }
}
