/**
 * Planning Session Command - Orchestrates the complete planning flow.
 *
 * Validates prerequisites (workspace open, scan completed) and focuses
 * the sidebar chat view to guide users through requirements generation.
 */
import * as vscode from 'vscode';
import { ChatViewProvider } from '../webview';
import { StorageManager } from '../storage';

/**
 * Start a new planning session.
 * Validates prerequisites and focuses the sidebar chat view.
 */
export async function startPlanningSession(
    chatViewProvider: ChatViewProvider | null,
    storageManager: StorageManager | null,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] Start Planning Session command invoked`);

    // 1. Check workspace is open
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
            'Open a workspace to use BrainGrid planning features.'
        );
        return;
    }

    // 2. Check storage is available
    if (!storageManager) {
        vscode.window.showErrorMessage(
            'BrainGrid storage is not available. Please try reopening the workspace.'
        );
        return;
    }

    // 3. Check scan has been run (artifacts exist)
    const artifacts = await storageManager.listStoredArtifacts();
    if (artifacts.length === 0) {
        const runScan = await vscode.window.showErrorMessage(
            'Please run "BrainGrid: Scan Project" first to analyze your codebase.',
            'Run Scan'
        );
        if (runScan === 'Run Scan') {
            vscode.commands.executeCommand('braingrid.scan');
        }
        return;
    }

    outputChannel.appendLine(`Found ${artifacts.length} scan artifacts`);

    // 4. Ensure ChatViewProvider has storage and focus the chat view
    if (chatViewProvider) {
        chatViewProvider.setStorageManager(storageManager);

        // Focus the sidebar chat view
        await vscode.commands.executeCommand('braingridChat.focus');

        // Set up completion listener
        const completionListener = chatViewProvider.onSessionComplete(() => {
            showCompletionNotification();
            completionListener.dispose();
        });
    } else {
        // Fallback: just focus the view
        await vscode.commands.executeCommand('braingridChat.focus');
    }

    outputChannel.appendLine('Planning session started');
}

/**
 * Show completion notification with action to view TreeView.
 */
function showCompletionNotification(): void {
    vscode.window.showInformationMessage(
        'Planning Session Complete! Requirements and tasks have been generated.',
        'View TreeView'
    ).then(selection => {
        if (selection === 'View TreeView') {
            vscode.commands.executeCommand('braingrid.viewArtifacts');
        }
    });
}
