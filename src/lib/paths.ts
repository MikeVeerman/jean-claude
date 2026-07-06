import os from 'os';
import path from 'path';
import fs from 'fs';
import type { ConfigPaths } from '../types/index.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';

export function detectPlatform(): 'darwin' | 'linux' | 'win32' {
  const platform = os.platform();
  if (platform === 'darwin') return 'darwin';
  if (platform === 'linux') return 'linux';
  if (platform === 'win32') return 'win32';
  throw new JeanClaudeError(
    `Unsupported platform: ${platform}`,
    ErrorCode.UNSUPPORTED_PLATFORM,
    'Jean-Claude supports macOS, Linux, and Windows only.'
  );
}

export function getJeanClaudeDir(): string {
  return path.join(detectClaudeConfigDir(), '.jean-claude');
}

export function detectClaudeConfigDir(): string {
  const home = os.homedir();
  const platform = detectPlatform();

  // Primary location (same on all platforms)
  const primaryPath = path.join(home, '.claude');
  if (fs.existsSync(primaryPath)) {
    return primaryPath;
  }

  // Alternate XDG location (Linux/macOS only — not on Windows)
  if (platform !== 'win32') {
    const xdgConfigHome =
      process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const alternatePath = path.join(xdgConfigHome, 'claude-code');
    if (fs.existsSync(alternatePath)) {
      return alternatePath;
    }
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

/**
 * Expand a leading ~ to the user's home directory.
 * Inverse of contractPath; used when reading config files from disk.
 * Accepts both ~/ and ~\ so config files written on any platform expand
 * correctly on any other. Passes through absolute paths, relative paths,
 * and falsy values unchanged.
 */
export function expandPath(p: string): string {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Replace the user's home directory prefix with ~ so config files stay
 * portable across machines. The result always uses forward slashes, so a
 * profiles.json written on Windows expands correctly on macOS/Linux and
 * vice versa. Only contracts at a path boundary: a sibling directory like
 * /Users/mikeshared is left untouched, since ~shared/... would not survive
 * the round-trip through expandPath.
 */
export function contractPath(p: string): string {
  if (!p) return p;
  const home = os.homedir();
  if (p === home) return '~';
  if (p.startsWith(home + path.sep) || p.startsWith(home + '/')) {
    return '~/' + p.slice(home.length + 1).split(path.sep).join('/');
  }
  return p;
}
