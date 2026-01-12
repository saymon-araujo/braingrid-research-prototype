import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StorageManager, ConfigManager } from './storage';
import { registerScanCommand } from './commands/scanCommand';
import { registerGenerateDocsCommand } from './commands/generateDocsCommand';
import { toggleTaskCompletion, sendTaskToCursor } from './commands/taskCommands';
import { startPlanningSession } from './commands/planningSession';
import { BrainGridTreeProvider, TaskTreeItem } from './views';
import { ChatPanel, ChatViewProvider } from './webview';

let outputChannel: vscode.OutputChannel;

// Module-level storage instances (null if memory-only mode)
let storageManager: StorageManager | null = null;
let configManager: ConfigManager | null = null;
let treeProvider: BrainGridTreeProvider | null = null;
let treeView: vscode.TreeView<any> | null = null;
let chatViewProvider: ChatViewProvider | null = null;

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

    // Update TreeView provider with storage manager
    if (treeProvider) {
        // Dispose old provider and create new one with storage
        treeProvider.dispose();
    }
    treeProvider = new BrainGridTreeProvider(storageManager);
    treeView = vscode.window.createTreeView('braingridExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    context.subscriptions.push(treeProvider);
    outputChannel.appendLine('TreeView initialized with storage');

    // Ensure .gitignore entry for config.json
    await ensureGitignoreEntry(workspaceRoot);

    // Update ChatViewProvider with storage manager
    if (chatViewProvider) {
        chatViewProvider.setStorageManager(storageManager);
        outputChannel.appendLine('ChatViewProvider updated with storage');
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Create output channel first for logging
    outputChannel = vscode.window.createOutputChannel('BrainGrid');
    context.subscriptions.push(outputChannel);

    // Log activation
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`BrainGrid extension activated at ${timestamp}`);

    // Create initial TreeView (shows empty state until storage is ready)
    treeProvider = new BrainGridTreeProvider(null);
    treeView = vscode.window.createTreeView('braingridExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    context.subscriptions.push(treeProvider);
    outputChannel.appendLine('TreeView created (awaiting storage initialization)');

    // Register ChatViewProvider for sidebar chat
    chatViewProvider = new ChatViewProvider(context.extensionUri, outputChannel);
    const chatViewDisposable = vscode.window.registerWebviewViewProvider(
        ChatViewProvider.viewType,
        chatViewProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(chatViewDisposable);
    outputChannel.appendLine('ChatViewProvider registered');

    // Initialize storage (async, but we don't block activation)
    initializeStorage(context).catch(error => {
        outputChannel.appendLine(`Storage initialization error: ${error}`);
        console.error('BrainGrid storage initialization failed:', error);
    });

    // Register scan command with full implementation
    registerScanCommand(context, outputChannel);

    // Register generate documentation command
    registerGenerateDocsCommand(context, outputChannel);

    // Register viewArtifacts command to focus TreeView (Explorer section)
    const viewArtifactsDisposable = vscode.commands.registerCommand('braingrid.viewArtifacts', async () => {
        const invokeTime = new Date().toISOString();
        outputChannel.appendLine(`[${invokeTime}] View Artifacts command invoked`);

        // Focus the Explorer view in the sidebar
        await vscode.commands.executeCommand('braingridExplorer.focus');
    });
    context.subscriptions.push(viewArtifactsDisposable);

    // Register task toggle command
    const toggleTaskDisposable = vscode.commands.registerCommand(
        'braingrid.toggleTask',
        (taskId: string, subtaskId: string | null) => {
            if (storageManager && treeProvider) {
                toggleTaskCompletion(taskId, subtaskId, storageManager, treeProvider, outputChannel);
            } else {
                vscode.window.showWarningMessage('Storage not available. Open a workspace first.');
            }
        }
    );
    context.subscriptions.push(toggleTaskDisposable);

    // Register send to Cursor command (receives TaskTreeItem from context menu)
    const sendToCursorDisposable = vscode.commands.registerCommand(
        'braingrid.sendTaskToCursor',
        (item: TaskTreeItem) => {
            if (storageManager && item?.task) {
                sendTaskToCursor(item.task, storageManager, outputChannel);
            } else if (!storageManager) {
                vscode.window.showWarningMessage('Storage not available. Open a workspace first.');
            } else {
                vscode.window.showWarningMessage('No task selected.');
            }
        }
    );
    context.subscriptions.push(sendToCursorDisposable);

    // Register openChat command with ChatPanel
    const openChatDisposable = vscode.commands.registerCommand(
        'braingrid.openChat',
        () => {
            const invokeTime = new Date().toISOString();
            outputChannel.appendLine(`[${invokeTime}] Open Chat command invoked`);
            const panel = ChatPanel.createOrShow(context, outputChannel);

            // Wire up StorageManager if available
            if (storageManager) {
                panel.setStorageManager(storageManager);
            }
        }
    );
    context.subscriptions.push(openChatDisposable);

    // Register startPlanning command - orchestrates the complete planning flow
    const startPlanningDisposable = vscode.commands.registerCommand(
        'braingrid.startPlanning',
        () => {
            startPlanningSession(chatViewProvider, storageManager, outputChannel);
        }
    );
    context.subscriptions.push(startPlanningDisposable);

    // Register refresh command to manually refresh TreeView
    const refreshDisposable = vscode.commands.registerCommand(
        'braingrid.refresh',
        () => {
            const invokeTime = new Date().toISOString();
            outputChannel.appendLine(`[${invokeTime}] Refresh command invoked`);
            if (treeProvider) {
                treeProvider.refresh();
            }
        }
    );
    context.subscriptions.push(refreshDisposable);

    // Register other commands (placeholder implementations)
    const commands = [
        { id: 'braingrid.sync', name: 'Sync' },
        { id: 'braingrid.login', name: 'Login' },
    ];

    for (const cmd of commands) {
        const disposable = vscode.commands.registerCommand(cmd.id, () => {
            const invokeTime = new Date().toISOString();
            outputChannel.appendLine(`[${invokeTime}] ${cmd.name} command invoked`);

            vscode.window.showInformationMessage(`BrainGrid: ${cmd.name} command invoked`);
        });
        context.subscriptions.push(disposable);
    }

    outputChannel.appendLine(`Registered ${commands.length + 8} commands`);

    // Show output channel
    outputChannel.show(true);
}

export function deactivate() {
    // Clean up references
    storageManager = null;
    configManager = null;
    treeProvider = null;
    treeView = null;
    chatViewProvider = null;
    // Resources are automatically disposed via context.subscriptions
}
