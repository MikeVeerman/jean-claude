import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { getConfigPaths, getJeanClaudeDir } from './paths.js';
import { JeanClaudeError, ErrorCode } from '../types/index.js';
import type { ProfileConfig, Profile } from '../types/index.js';

const PROFILES_FILE = 'profiles.json';

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
    return await fs.readJson(profilesPath);
  }
  return { profiles: {} };
}

export async function saveProfiles(config: ProfileConfig): Promise<void> {
  const profilesPath = getProfilesPath();
  await fs.writeJson(profilesPath, config, { spaces: 2 });
}

export function getProfileConfigDir(name: string): string {
  const home = os.homedir();
  return path.join(home, `.claude-${name}`);
}

export async function createProfile(name: string): Promise<Profile> {
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

  if (await fs.pathExists(configDir)) {
    throw new JeanClaudeError(
      `Directory ${configDir} already exists`,
      ErrorCode.ALREADY_EXISTS,
      `Remove it first or choose a different profile name.`
    );
  }

  // Create profile directory
  await fs.ensureDir(configDir);

  // Create symlinks for shared items
  const { claudeConfigDir } = getConfigPaths();
  await createSymlinks(claudeConfigDir, configDir);

  // Create an empty CLAUDE.md for the profile
  const claudeMdPath = path.join(configDir, 'CLAUDE.md');
  await fs.writeFile(
    claudeMdPath,
    `# Claude Code Configuration (${name} profile)\n\nThis file is loaded by Claude Code at the start of every session.\n`
  );

  // Save profile to registry
  const profile: Profile = {
    alias,
    configDir,
  };
  config.profiles[name] = profile;
  await saveProfiles(config);

  return profile;
}

export async function createSymlinks(
  sourceDir: string,
  targetDir: string
): Promise<string[]> {
  const created: string[] = [];

  for (const item of SHARED_ITEMS) {
    const sourcePath = path.join(sourceDir, item.name);
    const targetPath = path.join(targetDir, item.name);

    // Only symlink if source exists
    if (!(await fs.pathExists(sourcePath))) {
      continue;
    }

    // Remove existing target if any (shouldn't happen on create, but safe)
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath);
    }

    await fs.symlink(sourcePath, targetPath);
    created.push(item.name);
  }

  return created;
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
  return createSymlinks(claudeConfigDir, profile.configDir);
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

export function getShellAliasLine(profile: Profile): string {
  return `alias ${profile.alias}='CLAUDE_CONFIG_DIR="${profile.configDir}" claude'`;
}

export function getShellAliasBlock(name: string, profile: Profile): string {
  return `\n# jean-claude profile: ${name}\n${getShellAliasLine(profile)}\n`;
}

export async function installShellAlias(
  name: string,
  profile: Profile,
  shellConfigFile: string
): Promise<void> {
  const rcPath = path.join(os.homedir(), shellConfigFile);
  const block = getShellAliasBlock(name, profile);

  // Check if alias already exists
  if (await fs.pathExists(rcPath)) {
    const content = await fs.readFile(rcPath, 'utf-8');
    if (content.includes(`jean-claude profile: ${name}`)) {
      // Replace existing block
      const regex = new RegExp(
        `\\n# jean-claude profile: ${name}\\n[^\\n]+\\n`,
        'g'
      );
      const updated = content.replace(regex, block);
      await fs.writeFile(rcPath, updated);
      return;
    }
  }

  // Append alias block
  await fs.appendFile(rcPath, block);
}

export async function removeShellAlias(
  name: string,
  shellConfigFile: string
): Promise<boolean> {
  const rcPath = path.join(os.homedir(), shellConfigFile);

  if (!(await fs.pathExists(rcPath))) {
    return false;
  }

  const content = await fs.readFile(rcPath, 'utf-8');
  if (!content.includes(`jean-claude profile: ${name}`)) {
    return false;
  }

  const regex = new RegExp(
    `\\n# jean-claude profile: ${name}\\n[^\\n]+\\n`,
    'g'
  );
  const updated = content.replace(regex, '\n');
  await fs.writeFile(rcPath, updated);
  return true;
}

export function detectShellConfigFiles(): Array<{ name: string; value: string }> {
  const home = os.homedir();
  const options: Array<{ name: string; value: string }> = [];

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
