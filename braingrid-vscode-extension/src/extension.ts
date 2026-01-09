import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StorageManager, ConfigManager } from './storage';
import { registerScanCommand } from './commands/scanCommand';

let outputChannel: vscode.OutputChannel;

// Module-level storage instances (null if memory-only mode)
let storageManager: StorageManager | null = null;
let configManager: ConfigManager | null = null;

/**
 * Get the StorageManager instance.
 * @returns StorageManager or null if operating in memory-only mode
 */
export function getStorageManager(): StorageManager | null {
    return storageManager;
}

/**
 * Get the ConfigManager instance.
 * @returns ConfigManager or null if operating in memory-only mode
 */
export function getConfigManager(): ConfigManager | null {
    return configManager;
}

/**
 * Add .braingrid/config.json to .gitignore if not already present.
 */
async function ensureGitignoreEntry(workspaceRoot: string): Promise<void> {
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const entryToAdd = '.braingrid/config.json';

    try {
        // Check if .gitignore exists
        let content = '';
        try {
            content = await fs.promises.readFile(gitignorePath, 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
                // File exists but can't read - log and skip
                outputChannel.appendLine(`Warning: Cannot read .gitignore: ${err.message}`);
                return;
            }
            // File doesn't exist - we'll create it
        }

        // Check if entry already present
        const lines = content.split('\n');
        const hasEntry = lines.some(line => line.trim() === entryToAdd);

        if (!hasEntry) {
            // Append entry with proper newline handling
            const newContent = content.length > 0 && !content.endsWith('\n')
                ? `${content}\n${entryToAdd}\n`
                : `${content}${entryToAdd}\n`;

            await fs.promises.writeFile(gitignorePath, newContent, 'utf-8');
            outputChannel.appendLine(`Added ${entryToAdd} to .gitignore`);
        }
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        outputChannel.appendLine(`Warning: Could not update .gitignore: ${err.message}`);
    }
}

/**
 * Initialize storage system for the workspace.
 */
async function initializeStorage(context: vscode.ExtensionContext): Promise<void> {
    // Check if workspace is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        outputChannel.appendLine('No workspace open - operating in memory-only mode');
        vscode.window.showInformationMessage('Open a workspace to use BrainGrid storage features');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    outputChannel.appendLine(`Workspace root: ${workspaceRoot}`);

    // Create StorageManager and initialize workspace
    const storage = new StorageManager(workspaceRoot);
    const initResult = await storage.initWorkspace();

    if (!initResult.success) {
        // Handle initialization failure
        const errorMsg = initResult.error ?? 'Unknown error';
        outputChannel.appendLine(`Storage initialization failed: ${errorMsg}`);

        if (errorMsg.includes('read-only')) {
            vscode.window.showWarningMessage('Workspace is read-only. BrainGrid will operate in memory-only mode');
        } else if (errorMsg.includes('permission') || errorMsg.includes('Permission')) {
            vscode.window.showErrorMessage('Cannot initialize BrainGrid storage. Check folder permissions');
        } else {
            vscode.window.showWarningMessage(`BrainGrid storage unavailable: ${errorMsg}`);
        }
        return;
    }

    // Storage initialized successfully
    storageManager = storage;
    outputChannel.appendLine('StorageManager initialized successfully');

    if (initResult.foldersCreated && initResult.foldersCreated.length > 0) {
        outputChannel.appendLine(`Created folders: ${initResult.foldersCreated.join(', ')}`);
    }

    // Create ConfigManager
    configManager = new ConfigManager(storageManager, context);
    outputChannel.appendLine('ConfigManager initialized successfully');

    // Ensure .gitignore entry for config.json
    await ensureGitignoreEntry(workspaceRoot);
}

export function activate(context: vscode.ExtensionContext) {
    // Create output channel first for logging
    outputChannel = vscode.window.createOutputChannel('BrainGrid');
    context.subscriptions.push(outputChannel);

    // Log activation
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`BrainGrid extension activated at ${timestamp}`);

    // Initialize storage (async, but we don't block activation)
    initializeStorage(context).catch(error => {
        outputChannel.appendLine(`Storage initialization error: ${error}`);
        console.error('BrainGrid storage initialization failed:', error);
    });

    // Register scan command with full implementation
    registerScanCommand(context, outputChannel);

    // Register other commands (placeholder implementations)
    const commands = [
        { id: 'braingrid.sync', name: 'Sync' },
        { id: 'braingrid.openChat', name: 'Open Chat' },
        { id: 'braingrid.viewArtifacts', name: 'View Artifacts' },
        { id: 'braingrid.login', name: 'Login' },
    ];

    for (const cmd of commands) {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            const invokeTime = new Date().toISOString();
            outputChannel.appendLine(`[${invokeTime}] ${cmd.name} command invoked`);

            // Check storage availability for commands that need it
            if (cmd.id === 'braingrid.viewArtifacts') {
                if (!storageManager) {
                    vscode.window.showWarningMessage('Storage not available. Open a workspace to use this command.');
                    return;
                }
            }

            vscode.window.showInformationMessage(`BrainGrid: ${cmd.name} command invoked`);
        });
        context.subscriptions.push(disposable);
    }

    outputChannel.appendLine(`Registered ${commands.length + 1} commands`);

    // Show output channel
    outputChannel.show(true);
}

export function deactivate() {
    // Clean up storage references
    storageManager = null;
    configManager = null;
    // Resources are automatically disposed via context.subscriptions
}
