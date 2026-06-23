import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getConfigPaths, getJeanClaudeDir, detectPlatform } from './paths.js';
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
 * Returns the actual PowerShell profile path by querying PowerShell itself.
 * On some Windows systems (e.g. OneDrive sync, VS Code), $PROFILE is redirected
 * to a custom location like `~\OneDrive\Documents\WindowsPowerShell\Microsoft.VSCode_profile.ps1`.
 * This function ensures we always write to the file PowerShell actually loads.
 */
export function getPowerShellProfilePath(): string | null {
  if (detectPlatform() !== 'win32') return null;
  try {
    const output = execSync('powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Output $PROFILE"', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    }).trim();
    if (output && output.length > 0) {
      return output;
    }
  } catch {
    // Fallback below
  }
  return null;
}

/**
 * Items that get symlinked from the main ~/.claude/ into profile directories.
 * Everything else in the profile dir is profile-specific.
 */
export const SHARED_ITEMS = [
  { name: 'settings.json', type: 'file' as const },
  { name: 'statusline.sh', type: 'file' as const },
  { name: 'statusline.ps1', type: 'file' as const },
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
    return await fs.readJson(profilesPath);
  }
  return { profiles: {} };
}

export async function saveProfiles(config: ProfileConfig): Promise<void> {
  const profilesPath = getProfilesPath();
  const tmpPath = `${profilesPath}.${process.pid}.tmp`;
  await fs.writeJson(tmpPath, config, { spaces: 2 });
  await fs.rename(tmpPath, profilesPath);
}

export function getProfileConfigDir(name: string): string {
  const home = os.homedir();
  return path.join(home, `.claude-${name}`);
}

/**
 * Check if Git Bash is installed on Windows.
 * Git Bash ships with Git for Windows and provides bash.exe in the installation path.
 */
export function isGitBashInstalled(): boolean {
  if (detectPlatform() !== 'win32') return false;
  // Check common Git for Windows installation paths for bash.exe
  const gitBashPaths = [
    process.env['PROGRAMFILES(X64)'],
    process.env['PROGRAMFILES'],
    process.env['LOCALAPPDATA'] || '',
  ];
  const bashExePaths = [
    path.join(gitBashPaths[0] || '', 'Git', 'bin', 'bash.exe'),
    path.join(gitBashPaths[1] || '', 'Git', 'bin', 'bash.exe'),
    path.join(gitBashPaths[2] || '', 'Program Files\\Git\\bin\\bash.exe'),
  ];
  return bashExePaths.some(p => p && p.length > 0 && fs.existsSync(p));
}

export interface CreateProfileOptions {
  shareStatusline?: boolean;
  shareClaudeMd?: boolean;
}

export async function createProfile(
  name: string,
  options: CreateProfileOptions = {}
): Promise<Profile> {
  const platform = detectPlatform();
  // Default: never share statusline scripts unless explicitly requested.
  // On Windows both .sh and .ps1 can coexist (Git Bash + PowerShell).
  const shareStatuslineDefault = false;
  const { shareStatusline = shareStatuslineDefault, shareClaudeMd = false } = options;
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

  // Create symlinks for shared items (including statusline.sh)
  const { claudeConfigDir } = getConfigPaths();
  await createSymlinks(claudeConfigDir, configDir);

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
  /** Whether the item was symlinked or copied */
  method: 'symlink' | 'copy';
};

/**
 * Create symlinks (or copies as fallback) for shared items from sourceDir into targetDir.
 *
 * Platform behavior:
 * - **Directories**: Always use junctions on Windows (`junction`), direct symlinks elsewhere.
 * - **Files on Windows**: Try symlink first; fall back to copy when EPERM (no Developer Mode).
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

    // Remove existing target if any (shouldn't happen on create, but safe)
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }

    let method: 'symlink' | 'copy' = 'symlink';

    // On Windows, use directory junctions for directories to avoid admin
    // privilege requirements. fs-extra's fs.symlink with type:'dir' creates
    // junctions automatically on Windows.
    if (item.type === 'directory') {
      await fs.symlink(sourcePath, targetPath, 'junction');
    } else {
      try {
        await fs.symlink(sourcePath, targetPath);
      } catch (symlinkErr: unknown) {
        // File symlinks on Windows require Developer Mode or admin privileges.
        // Fall back to copying the file — the profile still works, just not as a symlink.
        const isEPERM =
          symlinkErr && typeof symlinkErr === 'object' && 'code' in symlinkErr
            && (symlinkErr as { code: string }).code === 'EPERM';
        if (isEPERM) {
          method = 'copy';
          await fs.copy(sourcePath, targetPath);
        } else {
          throw symlinkErr;
        }
      }
    }
    results.push({ name: item.name, method });
  }

  return results;
}

/**
 * Legacy alias returning just the names for backwards compatibility.
 * @deprecated Use {@link createSymlinks} and check `.method` for details.
 */
export async function createSymlinksAndGetNames(
  sourceDir: string,
  targetDir: string
): Promise<string[]> {
  const results = await createSymlinks(sourceDir, targetDir);
  return results.map((r) => r.name);
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
  const escDir = profile.configDir.replace(/\\/g, '\\\\');

  if (isPowerShell) {
    return `function ${profile.alias} { $env:CLAUDE_CONFIG_DIR="${escDir}"; claude @args }`;
  }

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

export async function installShellAlias(
  name: string,
  profile: Profile,
  shellConfigFile: string
): Promise<void> {
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
    return;
  }

  // Non-PowerShell: use legacy path
  const rcPath = path.join(os.homedir(), shellConfigFile);
  if (await fs.pathExists(rcPath)) {
    const content = await fs.readFile(rcPath, 'utf-8');
    if (content.includes(`jean-claude profile: ${name}`)) {
      const updated = content.replace(profileAliasRegex(name), block);
      await fs.writeFile(rcPath, updated);
      return;
    }
  }
  await fs.appendFile(rcPath, block);
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
    const actualProfile = getPowerShellProfilePath();
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

    if (fs.existsSync(path.join(home, '.zshrc'))) {
      options.push({ name: '.zshrc (WSL zsh)', value: '.zshrc' });
    } else {
      options.push({ name: '.zshrc (WSL zsh) - will be created', value: '.zshrc' });
    }
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
