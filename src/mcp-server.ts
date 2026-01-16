#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import os from 'os';
import { getConfigPaths } from './lib/paths.js';
import {
  isGitRepo,
  getGitStatus,
  commitAndPush,
  pull,
  resetHard,
  hasMergeConflicts,
  testRemoteConnection,
  cloneRepo,
  initRepo,
  addRemote,
} from './lib/git.js';
import {
  syncFromClaudeConfig,
  syncToClaudeConfig,
  updateLastSync,
  compareFiles,
  readMetaJson,
  createMetaJson,
  writeMetaJson,
} from './lib/sync.js';
import { ensureDir } from './lib/paths.js';
import { JeanClaudeError } from './types/index.js';

const server = new Server(
  {
    name: 'jean-claude',
    version: '1.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function generateCommitMessage(): string {
  const hostname = os.hostname();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `Update from ${hostname} at ${timestamp}`;
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sync_init',
        description:
          'Initialize Jean-Claude with a Git repository URL. This sets up config synchronization for the first time.',
        inputSchema: {
          type: 'object',
          properties: {
            repository_url: {
              type: 'string',
              description: 'Git repository URL (e.g., https://github.com/user/my-claude-config.git)',
            },
          },
          required: ['repository_url'],
        },
      },
      {
        name: 'sync_push',
        description:
          'Push local Claude configuration changes to the Git repository. Syncs CLAUDE.md, settings.json, and hooks/ to Git.',
        inputSchema: {
          type: 'object',
          properties: {
            commit_message: {
              type: 'string',
              description: 'Optional custom commit message. If not provided, auto-generates one.',
            },
          },
        },
      },
      {
        name: 'sync_pull',
        description:
          'Pull latest Claude configuration from Git repository and apply to local ~/.claude directory. This overwrites local changes.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'sync_status',
        description:
          'Check synchronization status between local Claude config and Git repository. Shows which files are in sync, differ, or not applied.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'sync_init': {
        const repoUrl = (args?.repository_url as string) || '';

        if (!repoUrl) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'repository_url is required'
          );
        }

        const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

        // Check if already initialized
        if (fs.existsSync(jeanClaudeDir)) {
          const isRepo = await isGitRepo(jeanClaudeDir);
          if (isRepo) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Jean-Claude is already initialized at ${jeanClaudeDir}. Run sync_status to see current state.`,
                },
              ],
            };
          }
          throw new McpError(
            ErrorCode.InternalError,
            `${jeanClaudeDir} exists but is not a Git repository. Remove it and try again.`
          );
        }

        // Test connection to remote
        const canConnect = await testRemoteConnection(repoUrl);
        if (!canConnect) {
          throw new McpError(
            ErrorCode.InternalError,
            'Cannot connect to repository. Check that the URL is correct and you have access.'
          );
        }

        // Try to clone or init fresh
        let message: string;
        try {
          await cloneRepo(repoUrl, jeanClaudeDir);
          message = 'Cloned existing config from repository';
        } catch {
          // Repo is empty, init locally and add remote
          ensureDir(jeanClaudeDir);
          await initRepo(jeanClaudeDir);
          await addRemote(jeanClaudeDir, repoUrl);
          message = 'Initialized new repository';
        }

        // Create meta.json
        const meta = createMetaJson(claudeConfigDir);
        await writeMetaJson(jeanClaudeDir, meta);

        return {
          content: [
            {
              type: 'text',
              text: `✓ Jean-Claude initialized!\n\n${message}\n\nRepository: ${jeanClaudeDir}\n\nNext steps:\n- Run sync_push to push your config to Git\n- Run sync_pull on other machines to sync`,
            },
          ],
        };
      }

      case 'sync_push': {
        const customMessage = args?.commit_message as string | undefined;
        const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

        // Verify initialized
        if (!fs.existsSync(jeanClaudeDir)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Jean-Claude is not initialized. Run sync_init first.'
          );
        }

        if (!(await isGitRepo(jeanClaudeDir))) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `${jeanClaudeDir} is not a Git repository. Run sync_init to set up properly.`
          );
        }

        // Sync from Claude config to Jean-Claude dir
        const syncResults = await syncFromClaudeConfig(
          claudeConfigDir,
          jeanClaudeDir
        );
        const synced = syncResults.filter((r) => r.action !== 'skipped');

        // Check git status
        const gitStatus = await getGitStatus(jeanClaudeDir);

        if (gitStatus.isClean) {
          return {
            content: [
              {
                type: 'text',
                text: '✓ Nothing to push - everything is in sync.',
              },
            ],
          };
        }

        // Build summary of changes
        const changes: string[] = [];
        gitStatus.modified.forEach((f) => changes.push(`  modified: ${f}`));
        gitStatus.untracked.forEach((f) => changes.push(`  new file: ${f}`));

        // Commit and push
        const commitMessage = customMessage || generateCommitMessage();
        const result = await commitAndPush(jeanClaudeDir, commitMessage, true);

        // Update last sync
        await updateLastSync(jeanClaudeDir);

        // Build response
        let response = '✓ Changes pushed successfully!\n\n';
        if (changes.length > 0) {
          response += 'Changes:\n' + changes.join('\n') + '\n\n';
        }
        if (result.committed) {
          response += `✓ Committed: ${commitMessage}\n`;
        }
        if (result.pushed) {
          response += '✓ Pushed to remote\n';
        } else if (!gitStatus.remote) {
          response +=
            '⚠ No remote configured - changes committed locally only\n';
        }

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      case 'sync_pull': {
        const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

        // Verify initialized
        if (!fs.existsSync(jeanClaudeDir)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Jean-Claude is not initialized. Run sync_init first.'
          );
        }

        if (!(await isGitRepo(jeanClaudeDir))) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `${jeanClaudeDir} is not a Git repository. Run sync_init to set up properly.`
          );
        }

        // Check if remote is configured
        const gitStatus = await getGitStatus(jeanClaudeDir);
        if (!gitStatus.remote) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'No remote configured. Run sync_init to set up a remote repository.'
          );
        }

        // Reset and pull
        await resetHard(jeanClaudeDir);
        const pullResult = await pull(jeanClaudeDir);

        // Check for merge conflicts
        if (await hasMergeConflicts(jeanClaudeDir)) {
          throw new McpError(
            ErrorCode.InternalError,
            `Merge conflicts detected in ${jeanClaudeDir}. Resolve conflicts and try again.`
          );
        }

        // Apply to ~/.claude
        const results = await syncToClaudeConfig(jeanClaudeDir, claudeConfigDir);
        const applied = results.filter((r) => r.action !== 'skipped');

        // Update last sync time
        await updateLastSync(jeanClaudeDir);

        // Build response
        let response = `✓ Config synced successfully!\n\n${pullResult.message}\n\n`;
        response += `Applied ${applied.length} file(s):\n`;
        applied.forEach((r) => {
          const icon = r.action === 'created' ? '+' : '~';
          response += `  ${icon} ${r.file}\n`;
        });

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      case 'sync_status': {
        const { jeanClaudeDir, claudeConfigDir } = getConfigPaths();

        // Verify initialized
        if (!fs.existsSync(jeanClaudeDir)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Jean-Claude is not initialized. Run sync_init first.'
          );
        }

        const isRepo = await isGitRepo(jeanClaudeDir);
        const gitStatus = isRepo ? await getGitStatus(jeanClaudeDir) : null;
        const meta = await readMetaJson(jeanClaudeDir);
        const fileComparison = compareFiles(jeanClaudeDir, claudeConfigDir);

        // Build status response
        let response = '=== Jean-Claude Status ===\n\n';
        response += `Repository: ${jeanClaudeDir}\n`;
        response += `Claude Config: ${claudeConfigDir}\n`;
        response += `Platform: ${meta?.platform || 'unknown'}\n\n`;

        // Git status
        response += 'Git Status:\n';
        if (!isRepo) {
          response += '  ✗ Not a Git repository\n';
        } else if (gitStatus) {
          response += `  Branch: ${gitStatus.branch || 'unknown'}\n`;
          response += `  Remote: ${gitStatus.remote || 'none'}\n`;

          if (gitStatus.isClean) {
            response += '  ✓ Working tree clean\n';
          } else {
            response += `  ! ${gitStatus.modified.length + gitStatus.untracked.length} uncommitted change(s)\n`;
          }

          if (gitStatus.ahead > 0) {
            response += `  ↑ ${gitStatus.ahead} commit(s) ahead\n`;
          }
          if (gitStatus.behind > 0) {
            response += `  ↓ ${gitStatus.behind} commit(s) behind\n`;
          }
        }

        // File sync status
        response += '\nSync Status:\n';
        fileComparison.forEach((c) => {
          let status: string;
          let icon: string;

          if (!c.sourceExists) {
            status = 'not configured';
            icon = '-';
          } else if (!c.targetExists) {
            status = 'not applied';
            icon = '!';
          } else if (c.inSync) {
            status = 'in sync';
            icon = '✓';
          } else {
            status = 'differs';
            icon = '!';
          }

          response += `  ${icon} ${c.mapping.source.padEnd(15)} → ${c.mapping.target.padEnd(15)} ${status}\n`;
        });

        // Last sync
        if (meta?.lastSync) {
          response += `\nLast sync: ${new Date(meta.lastSync).toLocaleString()}\n`;
        }

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    // Handle JeanClaudeError and other errors
    if (error instanceof JeanClaudeError) {
      throw new McpError(ErrorCode.InternalError, error.message);
    }
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      error instanceof Error ? error.message : String(error)
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
