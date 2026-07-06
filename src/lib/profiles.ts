import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getConfigPaths, getJeanClaudeDir, detectPlatform, expandPath, contractPath } from './paths.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';
import type { ProfileConfig, Profile } from '../types/index.js';

const PROFILES_FILE = 'profiles.json';

/**
 * Returns all PowerShell profile paths where aliases should be written.
 * On Windows, this includes both PowerShell 5.1 ($PROFILE) and PowerShell 7.x ($PROFILE),
 * as they may have different locations (e.g. OneDrive redirect, VS Code profile).
 * Returns an array of paths — never empty on Windows (always has at least a fallback).
 */
export function getAllPowerShellProfilePaths(): string[] {
  if (detectPlatform() !== 'win32') return [];

  const paths: string[] = [];

  // Get PowerShell 5.1 profile
  try {
    const output = execSync('powershell -NoProfile -Command "Write-Host -NoNewline $PROFILE"', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    }).trim();
    if (output && output.length > 0) {
      paths.push(output);
    }
  } catch {
    // Fallback below
  }

  // Get PowerShell 7.x profile if available
  try {
    const output = execSync('pwsh -NoProfile -Command "Write-Host -NoNewline $PROFILE"', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    }).trim();
    if (output && output.length > 0) {
      // Avoid adding duplicate if same as PS5.1
      if (!paths.includes(output)) {
        paths.push(output);
      }
    }
  } catch {
    // pwsh not installed — that's fine, PS5.1 is still available
  }

  // Fallback: if no paths were collected, use the legacy default
  if (paths.length === 0) {
    paths.push(path.join(os.homedir(), 'Microsoft.PowerShell_profile.ps1'));
  }

  return paths;
}

/**
 * Items that get symlinked from the main ~/.claude/ into profile directories.
 * Everything else in the profile dir is profile-specific.
 */
export const SHARED_ITEMS = [
  { name: 'settings.json', type: 'file' as const },
  { name: 'hooks', type: 'directory' as const },
  { name: 'agents', type: 'directory' as const },
  { name: 'skills', type: 'directory' as const },
  { name: 'plugins', type: 'directory' as const },
  { name: 'keybindings.json', type: 'file' as const },
];

function getProfilesPath(): string {
  return path.join(getJeanClaudeDir(), PROFILES_FILE);
}

export async function loadProfiles(): Promise<ProfileConfig> {
  const profilesPath = getProfilesPath();
  if (await fs.pathExists(profilesPath)) {
    const config: ProfileConfig = await fs.readJson(profilesPath);
    // Expand ~ to absolute paths for runtime use
    for (const profile of Object.values(config.profiles)) {
      profile.configDir = expandPath(profile.configDir);
    }
    return config;
  }
  return { profiles: {} };
}

export async function saveProfiles(config: ProfileConfig): Promise<void> {
  const profilesPath = getProfilesPath();
  const tmpPath = `${profilesPath}.${process.pid}.tmp`;
  // Store paths with ~ for portability across machines
  const portableConfig: ProfileConfig = {
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([name, profile]) => [
        name,
        { ...profile, configDir: contractPath(profile.configDir) },
      ])
    ),
  };
  await fs.writeJson(tmpPath, portableConfig, { spaces: 2 });
  await fs.rename(tmpPath, profilesPath);
}

export function getProfileConfigDir(name: string): string {
  const home = os.homedir();
  return path.join(home, `.claude-${name}`);
}

export interface CreateProfileOptions {
  shareStatusline?: boolean;
  shareClaudeMd?: boolean;
}

export async function createProfile(
  name: string,
  options: CreateProfileOptions = {}
): Promise<Profile> {
  // Default: never share statusline scripts unless explicitly requested.
  // On Windows both .sh and .ps1 can coexist (Git Bash + PowerShell).
  const { shareStatusline = false, shareClaudeMd = false } = options;
  const config = await loadProfiles();

  if (config.profiles[name]) {
    throw new JeanClaudeError(
      `Profile "${name}" already exists`,
      ErrorCode.ALREADY_EXISTS,
      `Use 'jean-claude profile list' to see existing profiles.`
    );
  }

  const configDir = getProfileConfigDir(name);
  const alias = `claude-${name}`;

  // Atomic directory creation — avoids TOCTOU race between exists-check and mkdir
  try {
    await fs.mkdir(configDir, { recursive: false });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EEXIST') {
      throw new JeanClaudeError(
        `Profile directory ${configDir} already exists on disk`,
        ErrorCode.ALREADY_EXISTS,
        `Remove it manually or choose a different profile name.`
      );
    }
    throw err;
  }

  // Create symlinks for shared items
  const { claudeConfigDir } = getConfigPaths();
  await createSymlinks(claudeConfigDir, configDir);

  // Optionally symlink statusline scripts from main config
  if (shareStatusline) {
    for (const statuslineFile of ['statusline.sh', 'statusline.ps1']) {
      const sourcePath = path.join(claudeConfigDir, statuslineFile);
      const targetPath = path.join(configDir, statuslineFile);
      if (await fs.pathExists(sourcePath)) {
        await fs.symlink(sourcePath, targetPath);
      }
    }
  }

  // Handle CLAUDE.md: symlink from main config or create independent file
  const claudeMdPath = path.join(configDir, 'CLAUDE.md');
  const claudeMdSource = path.join(claudeConfigDir, 'CLAUDE.md');
  if (shareClaudeMd && (await fs.pathExists(claudeMdSource))) {
    await fs.symlink(claudeMdSource, claudeMdPath);
  } else {
    await fs.writeFile(
      claudeMdPath,
      `# Claude Code Configuration (${name} profile)\n\nThis file is loaded by Claude Code at the start of every session.\n`
    );
  }

  // Save profile to registry
  const profile: Profile = {
    alias,
    configDir,
  };
  config.profiles[name] = profile;
  await saveProfiles(config);

  return profile;
}

/**
 * Result of creating a single shared item (symlink or copy).
 */
export type SharedItemResult = {
  /** The name of the item (e.g., 'settings.json', 'hooks') */
  name: string;
  /** Whether the item was symlinked, hardlinked, or copied */
  method: 'symlink' | 'link' | 'copy';
};

/**
 * Create links (symlinks, hardlinks, junctions, or copies as fallback) for shared items
 * from sourceDir into targetDir.
 *
 * Platform behavior:
 * - **Directories**: Always use junctions on Windows (`junction`), direct symlinks elsewhere.
 * - **Files on Windows**: Use hardlinks (`fs.link()`) — no Developer Mode or admin required.
 *   Falls back to copy on ENOENT (e.g., cross-volume).
 * - **Files on macOS/Linux**: Direct symlink.
 */
export async function createSymlinks(
  sourceDir: string,
  targetDir: string
): Promise<SharedItemResult[]> {
  const results: SharedItemResult[] = [];

  for (const item of SHARED_ITEMS) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(targetDir, item.name);

    // Only process if source exists
    if (!(await fs.pathExists(sourcePath))) {
      continue;
    }

    // Remove existing target if any (also handles broken symlinks, which
    // fs.pathExists would miss because it follows the link)
    await fs.remove(targetPath);

    let method: 'symlink' | 'link' | 'copy' = 'symlink';

    // On Windows, use directory junctions for directories to avoid admin
    // privilege requirements. fs-extra's fs.symlink with type:'dir' creates
    // junctions automatically on Windows.
    if (item.type === 'directory') {
      await fs.symlink(sourcePath, targetPath, 'junction');
      method = 'symlink';
    } else if (detectPlatform() === 'win32') {
      // On Windows, use hardlinks for files — they require no special privileges
      // (unlike symlinks which need Developer Mode or admin). Hardlinks only work
      // within the same volume; if cross-volume, fall back to copy.
      try {
        await fs.link(sourcePath, targetPath);
        method = 'link';
      } catch (linkErr: unknown) {
        // Hardlinks fail with EXDEV when source and target are on different
        // volumes, or EPERM when the filesystem denies hardlink creation.
        // Fall back to copying the file — the profile still works, just not linked.
        const code =
          linkErr && typeof linkErr === 'object' && 'code' in linkErr
            ? (linkErr as { code: string }).code
            : undefined;
        if (code === 'EXDEV' || code === 'EPERM') {
          method = 'copy';
          await fs.copy(sourcePath, targetPath);
        } else {
          throw linkErr;
        }
      }
    } else {
      // macOS/Linux: direct symlink
      await fs.symlink(sourcePath, targetPath);
      method = 'symlink';
    }
    results.push({ name: item.name, method });
  }

  return results;
}

export async function refreshSymlinks(name: string): Promise<string[]> {
  const config = await loadProfiles();
  const profile = config.profiles[name];

  if (!profile) {
    throw new JeanClaudeError(
      `Profile "${name}" not found`,
      ErrorCode.NOT_INITIALIZED,
      `Use 'jean-claude profile list' to see existing profiles.`
    );
  }

  const { claudeConfigDir } = getConfigPaths();
  const results = await createSymlinks(claudeConfigDir, profile.configDir);
  return results.map((r) => r.name);
}

/**
 * Re-create links for all profiles. Needed on Windows after a sync pull:
 * hardlinks share an inode with the file as it existed at link time, so when
 * the source file in ~/.claude is replaced, every profile's hardlink keeps
 * pointing at the old content. Returns the names of the profiles re-linked.
 */
export async function relinkAllProfiles(): Promise<string[]> {
  const config = await loadProfiles();
  const { claudeConfigDir } = getConfigPaths();
  const relinked: string[] = [];

  for (const [name, profile] of Object.entries(config.profiles)) {
    if (await fs.pathExists(profile.configDir)) {
      await createSymlinks(claudeConfigDir, profile.configDir);
      relinked.push(name);
    }
  }

  return relinked;
}

export type SharedItemIssue = {
  name: string;
  /** 'broken' — symlink whose target no longer exists; 'stale' — file no longer linked to the source (detached hardlink or diverged copy) */
  kind: 'broken' | 'stale';
};

/**
 * Check the health of a profile's shared items.
 * - Symlinks/junctions: broken if the link target no longer exists.
 * - Regular files (Windows hardlinks or copy fallback): stale if they no
 *   longer point at the same inode as the source — e.g. after the source was
 *   replaced by a sync pull. Fixable with `jean-claude profile refresh`.
 */
export async function checkSharedItemHealth(
  sourceDir: string,
  profileDir: string
): Promise<SharedItemIssue[]> {
  const issues: SharedItemIssue[] = [];

  for (const item of SHARED_ITEMS) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(profileDir, item.name);

    let isSymlink: boolean;
    try {
      isSymlink = (await fs.lstat(targetPath)).isSymbolicLink();
    } catch {
      // Item doesn't exist in profile — ok if the source doesn't exist either
      continue;
    }

    if (isSymlink) {
      const linkTarget = await fs.readlink(targetPath);
      if (!(await fs.pathExists(linkTarget))) {
        issues.push({ name: item.name, kind: 'broken' });
      }
      continue;
    }

    // Regular file: on Windows this should be a hardlink to (or copy of) the
    // source. Same inode means the hardlink is intact. Different inode is fine
    // for the copy fallback as long as the content still matches — flag only
    // when the profile's file has drifted from the source.
    if (item.type === 'file' && (await fs.pathExists(sourcePath))) {
      try {
        const sourceStat = await fs.stat(sourcePath);
        const targetStat = await fs.stat(targetPath);
        if (sourceStat.ino === targetStat.ino && sourceStat.dev === targetStat.dev) {
          continue;
        }
        const [sourceContent, targetContent] = await Promise.all([
          fs.readFile(sourcePath),
          fs.readFile(targetPath),
        ]);
        if (!sourceContent.equals(targetContent)) {
          issues.push({ name: item.name, kind: 'stale' });
        }
      } catch {
        // Race with concurrent deletion — skip
      }
    }
  }

  return issues;
}

export async function deleteProfile(name: string): Promise<Profile> {
  const config = await loadProfiles();
  const profile = config.profiles[name];

  if (!profile) {
    throw new JeanClaudeError(
      `Profile "${name}" not found`,
      ErrorCode.NOT_INITIALIZED,
      `Use 'jean-claude profile list' to see existing profiles.`
    );
  }

  // Remove profile directory
  if (await fs.pathExists(profile.configDir)) {
    await fs.remove(profile.configDir);
  }

  // Remove from registry
  delete config.profiles[name];
  await saveProfiles(config);

  return profile;
}

/**
 * Returns the shell alias line for a profile, formatted for the target shell.
 * - Bash/Zsh: `alias claude-name='CLAUDE_CONFIG_DIR="..." claude'`
 * - PowerShell: `function claude-name { $env:CLAUDE_CONFIG_DIR="..."; claude @args }`
 */
export function getShellAliasLine(
  profile: Profile,
  shellConfigFile: string = '.bashrc'
): string {
  const isPowerShell = shellConfigFile.endsWith('.ps1');

  if (isPowerShell) {
    // Backslash is NOT an escape character in PowerShell — use the path as-is,
    // in a single-quoted string where only single quotes need doubling.
    const psDir = profile.configDir.replace(/'/g, "''");
    return `function ${profile.alias} { $env:CLAUDE_CONFIG_DIR='${psDir}'; claude @args }`;
  }

  // Bash/Zsh: inside double quotes, backslashes must be escaped
  const escDir = profile.configDir.replace(/\\/g, '\\\\');
  return `alias ${profile.alias}='CLAUDE_CONFIG_DIR="${escDir}" claude'`;
}

/**
 * Returns the full shell alias block for a profile, including the comment header.
 */
export function getShellAliasBlock(
  name: string,
  profile: Profile,
  shellConfigFile: string = '.bashrc'
): string {
  return `\n# jean-claude profile: ${name}\n${getShellAliasLine(profile, shellConfigFile)}\n`;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function profileAliasRegex(name: string): RegExp {
  return new RegExp(
    `\\n# jean-claude profile: ${escapeRegExp(name)}\\n[^\\n]+\\n`,
    'g'
  );
}

/**
 * Returns the shell-specific source/instruction string for displaying to the user.
 * - Bash/Zsh: `source ~/.bashrc`
 * - PowerShell: `. $PROFILE` or `source ~/<file>` (for .ps1, use dot-source)
 */
export function getReloadInstruction(shellConfigFile: string): string {
  const isPowerShell = shellConfigFile.endsWith('.ps1');
  if (isPowerShell) {
    return `. $PROFILE`;
  }
  return `source ~/${shellConfigFile}`;
}

/**
 * Install the shell alias for a profile.
 * Returns the paths of the config files that were written — on Windows with a
 * .ps1 target this covers ALL PowerShell profiles (PS 5.1 and PS 7.x, which
 * may live in different locations, e.g. OneDrive redirects).
 */
export async function installShellAlias(
  name: string,
  profile: Profile,
  shellConfigFile: string
): Promise<string[]> {
  const block = getShellAliasBlock(name, profile, shellConfigFile);

  if (detectPlatform() === 'win32' && shellConfigFile.endsWith('.ps1')) {
    // Write to ALL PowerShell profiles (PS 5.1 and PS 7.x)
    const allPaths = getAllPowerShellProfilePaths();
    for (const rcPath of allPaths) {
      // Ensure parent directory exists
      const dir = path.dirname(rcPath);
      await fs.ensureDir(dir);

      if (await fs.pathExists(rcPath)) {
        const content = await fs.readFile(rcPath, 'utf-8');
        if (content.includes(`jean-claude profile: ${name}`)) {
          const updated = content.replace(profileAliasRegex(name), block);
          await fs.writeFile(rcPath, updated);
          continue;
        }
      }
      // Append alias block
      await fs.appendFile(rcPath, block);
    }
    return allPaths;
  }

  // Non-PowerShell: use legacy path
  const rcPath = path.join(os.homedir(), shellConfigFile);
  if (await fs.pathExists(rcPath)) {
    const content = await fs.readFile(rcPath, 'utf-8');
    if (content.includes(`jean-claude profile: ${name}`)) {
      const updated = content.replace(profileAliasRegex(name), block);
      await fs.writeFile(rcPath, updated);
      return [rcPath];
    }
  }
  await fs.appendFile(rcPath, block);
  return [rcPath];
}

export async function removeShellAlias(
  name: string,
  shellConfigFile: string
): Promise<boolean> {
  let removed = false;

  if (detectPlatform() === 'win32' && shellConfigFile.endsWith('.ps1')) {
    // Remove from ALL PowerShell profiles (PS 5.1 and PS 7.x)
    const allPaths = getAllPowerShellProfilePaths();
    for (const rcPath of allPaths) {
      if (!(await fs.pathExists(rcPath))) {
        continue;
      }
      const content = await fs.readFile(rcPath, 'utf-8');
      if (!content.includes(`jean-claude profile: ${name}`)) {
        continue;
      }
      const updated = content.replace(profileAliasRegex(name), '\n');
      await fs.writeFile(rcPath, updated);
      removed = true;
    }
    return removed;
  }

  // Non-PowerShell: use legacy path
  const rcPath = path.join(os.homedir(), shellConfigFile);
  if (!(await fs.pathExists(rcPath))) {
    return false;
  }
  const content = await fs.readFile(rcPath, 'utf-8');
  if (!content.includes(`jean-claude profile: ${name}`)) {
    return false;
  }
  const updated = content.replace(profileAliasRegex(name), '\n');
  await fs.writeFile(rcPath, updated);
  return true;
}

export function detectShellConfigFiles(): Array<{ name: string; value: string }> {
  const home = os.homedir();
  const platform = detectPlatform();
  const options: Array<{ name: string; value: string }> = [];

  // On Windows, prioritize PowerShell profile, then Git Bash/WSL options
  if (platform === 'win32') {
    // Always offer the actual $PROFILE first (it may be redirected via OneDrive, VS Code, etc.)
    const psProfiles = getAllPowerShellProfilePaths();
    const actualProfile = psProfiles.length > 0 ? psProfiles[0] : null;
    if (actualProfile && fs.existsSync(actualProfile)) {
      options.push({ name: `PowerShell ($PROFILE) — actual: ${actualProfile}`, value: 'Microsoft.PowerShell_profile.ps1' });
    } else if (actualProfile) {
      options.push({ name: 'PowerShell ($PROFILE) — will be created', value: 'Microsoft.PowerShell_profile.ps1' });
    } else {
      // Fallback to legacy hardcoded path
      const legacyPath = path.join(
        process.env.APPDATA || home,
        'PowerShell',
        'Microsoft.PowerShell_profile.ps1'
      );
      if (fs.existsSync(legacyPath)) {
        options.push({ name: 'Microsoft.PowerShell_profile.ps1 (PowerShell)', value: 'Microsoft.PowerShell_profile.ps1' });
      } else {
        options.push({ name: 'Microsoft.PowerShell_profile.ps1 (PowerShell) - will be created', value: 'Microsoft.PowerShell_profile.ps1' });
      }
    }

    // Note: no .zshrc option on Windows — WSL has its own home directory, so
    // writing to the Windows-side .zshrc would have no effect in WSL.
    if (fs.existsSync(path.join(home, '.bashrc'))) {
      options.push({ name: '.bashrc (Git Bash)', value: '.bashrc' });
    } else {
      options.push({ name: '.bashrc (Git Bash) - will be created', value: '.bashrc' });
    }
    return options;
  }

  // macOS / Linux
  if (fs.existsSync(path.join(home, '.zshrc'))) {
    options.push({ name: '.zshrc (zsh)', value: '.zshrc' });
  }
  if (fs.existsSync(path.join(home, '.bashrc'))) {
    options.push({ name: '.bashrc (bash)', value: '.bashrc' });
  }
  if (fs.existsSync(path.join(home, '.bash_profile'))) {
    options.push({ name: '.bash_profile (bash)', value: '.bash_profile' });
  }

  // Always offer these even if they don't exist yet
  if (!options.some((o) => o.value === '.zshrc')) {
    options.push({ name: '.zshrc (zsh) - will be created', value: '.zshrc' });
  }
  if (!options.some((o) => o.value === '.bashrc')) {
    options.push({
      name: '.bashrc (bash) - will be created',
      value: '.bashrc',
    });
  }

  return options;
}
