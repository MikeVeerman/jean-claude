import os from 'os';
import path from 'path';
import fs from 'fs';
import type { ConfigPaths } from '../types/index.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

export function detectPlatform(): 'darwin' | 'linux' {
  const platform = os.platform();
  if (platform === 'darwin' || platform === 'linux') {
    return platform;
  }
  throw new JeanClaudeError(
    `Unsupported platform: ${platform}`,
    ErrorCode.UNSUPPORTED_PLATFORM,
    'Jean-Claude supports macOS and Linux only.'
  );
}

export function getJeanClaudeDir(): string {
  return path.join(detectClaudeConfigDir(), '.jean-claude');
}

export function detectClaudeConfigDir(): string {
  const home = os.homedir();

  // Primary location (same on both macOS and Linux)
  const primaryPath = path.join(home, '.claude');
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }

  // Alternate XDG location (primarily Linux)
  const xdgConfigHome =
    process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const alternatePath = path.join(xdgConfigHome, 'claude-code');
  if (fs.existsSync(alternatePath)) {
    return alternatePath;
  }

  // Default to primary (will be created if needed)
  return primaryPath;
}

export function getConfigPaths(): ConfigPaths {
  return {
    jeanClaudeDir: getJeanClaudeDir(),
    claudeConfigDir: detectClaudeConfigDir(),
    platform: detectPlatform(),
  };
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
