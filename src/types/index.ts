export class JeanClaudeError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public suggestion?: string
  ) {
    super(message);
    this.name = 'JeanClaudeError';
  }
}

export enum ErrorCode {
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  NOT_GIT_REPO = 'NOT_GIT_REPO',
  NO_REMOTE = 'NO_REMOTE',
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG',
  UNSUPPORTED_PLATFORM = 'UNSUPPORTED_PLATFORM',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CLONE_FAILED = 'CLONE_FAILED',
}

export interface ConfigPaths {
  jeanClaudeDir: string;
  claudeConfigDir: string;
  platform: 'darwin' | 'linux';
}

export interface FileMapping {
  source: string;
  target: string;
  type: 'file' | 'directory';
}

export interface MetaJson {
  version: string;
  managedBy?: string;
  lastSync: string | null;
  machineId: string;
  platform: string;
  claudeConfigPath: string;
}

export interface SyncResult {
  file: string;
  action: 'copied' | 'skipped' | 'created' | 'updated' | 'deleted';
  source: string;
  target: string;
}

export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  branch: string | null;
  remote: string | null;
  ahead: number;
  behind: number;
  modified: string[];
  untracked: string[];
}

export interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
  suggestion?: string;
}

export interface Profile {
  alias: string;
  configDir: string;
}

export interface ProfileConfig {
  profiles: Record<string, Profile>;
}
