import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Hook configuration for Claude Code
 */
interface HookConfig {
  type: 'command';
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookConfig[];
}

interface ClaudeSettings {
  hooks?: {
    SessionStart?: HookMatcher[];
    UserPromptSubmit?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * Result of hook installation
 */
export interface HookInstallResult {
  success: boolean;
  path: string;
  merged: boolean;
  message: string;
}

/**
 * The Memorai hook configuration to install
 */
const MEMORAI_HOOKS = {
  SessionStart: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command' as const,
          command: 'npx memorai context --mode session',
        },
      ],
    },
  ],
  UserPromptSubmit: [
    {
      matcher: '',
      hooks: [
        {
          type: 'command' as const,
          command: 'npx memorai context --mode prompt --stdin',
        },
      ],
    },
  ],
};

/**
 * Get the path to Claude's global settings file
 */
export function getClaudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/**
 * Check if Memorai hooks are already installed
 */
export function areHooksInstalled(): boolean {
  const settingsPath = getClaudeSettingsPath();

  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as ClaudeSettings;

    // Check if our hooks exist
    const sessionHooks = settings.hooks?.SessionStart ?? [];
    const promptHooks = settings.hooks?.UserPromptSubmit ?? [];

    const hasSessionHook = sessionHooks.some((h) =>
      h.hooks?.some((hook) => hook.command?.includes('memorai context'))
    );
    const hasPromptHook = promptHooks.some((h) =>
      h.hooks?.some((hook) => hook.command?.includes('memorai context'))
    );

    return hasSessionHook && hasPromptHook;
  } catch {
    return false;
  }
}

/**
 * Install Memorai hooks into Claude's global settings
 */
export function installGlobalHooks(): HookInstallResult {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  try {
    // Create ~/.claude directory if needed
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Read existing settings or create new
    let settings: ClaudeSettings = {};
    let merged = false;

    if (existsSync(settingsPath)) {
      try {
        const content = readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(content) as ClaudeSettings;
        merged = true;
      } catch {
        // File exists but couldn't be parsed, start fresh
        settings = {};
      }
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Check if hooks already exist (avoid duplicates)
    if (areHooksInstalled()) {
      return {
        success: true,
        path: settingsPath,
        merged: true,
        message: 'Memorai hooks already installed',
      };
    }

    // Add or merge SessionStart hooks
    const existingSessionHooks = settings.hooks.SessionStart ?? [];
    settings.hooks.SessionStart = [
      ...existingSessionHooks.filter(
        (h) => !h.hooks?.some((hook) => hook.command?.includes('memorai'))
      ),
      ...MEMORAI_HOOKS.SessionStart,
    ];

    // Add or merge UserPromptSubmit hooks
    const existingPromptHooks = settings.hooks.UserPromptSubmit ?? [];
    settings.hooks.UserPromptSubmit = [
      ...existingPromptHooks.filter(
        (h) => !h.hooks?.some((hook) => hook.command?.includes('memorai'))
      ),
      ...MEMORAI_HOOKS.UserPromptSubmit,
    ];

    // Write settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    return {
      success: true,
      path: settingsPath,
      merged,
      message: merged
        ? 'Memorai hooks merged into existing settings'
        : 'Memorai hooks installed',
    };
  } catch (error) {
    return {
      success: false,
      path: settingsPath,
      merged: false,
      message: `Failed to install hooks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Remove Memorai hooks from Claude's global settings
 */
export function uninstallGlobalHooks(): HookInstallResult {
  const settingsPath = getClaudeSettingsPath();

  if (!existsSync(settingsPath)) {
    return {
      success: true,
      path: settingsPath,
      merged: false,
      message: 'No settings file found, nothing to uninstall',
    };
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as ClaudeSettings;

    if (!settings.hooks) {
      return {
        success: true,
        path: settingsPath,
        merged: false,
        message: 'No hooks configured, nothing to uninstall',
      };
    }

    // Remove Memorai hooks from SessionStart
    if (settings.hooks.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
        (h) => !h.hooks?.some((hook) => hook.command?.includes('memorai'))
      );
      if (settings.hooks.SessionStart.length === 0) {
        delete settings.hooks.SessionStart;
      }
    }

    // Remove Memorai hooks from UserPromptSubmit
    if (settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
        (h) => !h.hooks?.some((hook) => hook.command?.includes('memorai'))
      );
      if (settings.hooks.UserPromptSubmit.length === 0) {
        delete settings.hooks.UserPromptSubmit;
      }
    }

    // Remove empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    return {
      success: true,
      path: settingsPath,
      merged: true,
      message: 'Memorai hooks uninstalled',
    };
  } catch (error) {
    return {
      success: false,
      path: settingsPath,
      merged: false,
      message: `Failed to uninstall hooks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
