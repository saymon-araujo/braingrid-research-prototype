/**
 * Task command handlers for interactive TreeView actions.
 */
import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { Task } from '../storage/types';
import { BrainGridTreeProvider } from '../views';
import {
    sendToCursorChat,
    getCursorIntegrationPreference,
    discoverCursorCommands
} from '../integrations/cursorIntegration';

/**
 * Toggle task or subtask completion status.
 * @param taskId - The parent task ID
 * @param subtaskId - The subtask ID (null if toggling parent task)
 * @param storageManager - Storage manager for persistence
 * @param treeProvider - Tree provider for refresh
 * @param outputChannel - Output channel for logging
 */
export async function toggleTaskCompletion(
    taskId: string,
    subtaskId: string | null,
    storageManager: StorageManager,
    treeProvider: BrainGridTreeProvider,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    try {
        // Load current tasks
        const tasks = await storageManager.loadTasks();

        // Find the task
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
            outputChannel.appendLine(`[ERROR] Task not found: ${taskId}`);
            vscode.window.showErrorMessage('Task not found');
            return;
        }

        if (subtaskId) {
            // Toggle subtask
            const subtask = task.subtasks.find(s => s.id === subtaskId);
            if (!subtask) {
                outputChannel.appendLine(`[ERROR] Subtask not found: ${subtaskId}`);
                vscode.window.showErrorMessage('Subtask not found');
                return;
            }

            // Toggle subtask completion
            subtask.completed = !subtask.completed;
            outputChannel.appendLine(`Toggled subtask "${subtask.title}" to ${subtask.completed ? 'completed' : 'incomplete'}`);

            // Update parent task based on subtask states
            if (task.subtasks.length > 0) {
                const allComplete = task.subtasks.every(s => s.completed);
                task.completed = allComplete;
            }
        } else {
            // Toggle parent task
            const newState = !task.completed;
            task.completed = newState;
            outputChannel.appendLine(`Toggled task "${task.title}" to ${newState ? 'completed' : 'incomplete'}`);

            // When toggling parent, update all subtasks to match
            if (task.subtasks.length > 0) {
                task.subtasks.forEach(s => {
                    s.completed = newState;
                });
                outputChannel.appendLine(`Updated ${task.subtasks.length} subtasks to ${newState ? 'completed' : 'incomplete'}`);
            }
        }

        // Save tasks atomically
        await storageManager.saveTasks(tasks);
        outputChannel.appendLine('Tasks saved successfully');

        // Refresh tree view
        treeProvider.refresh();

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[ERROR] Failed to toggle task: ${message}`);
        vscode.window.showErrorMessage(`Failed to update task: ${message}`);
    }
}

/**
 * Send task context to Cursor AI.
 *
 * Uses a hybrid approach based on user preference:
 * - 'auto': Try Cursor API first, fall back to clipboard
 * - 'api': API only (may fail if not running in Cursor)
 * - 'clipboard': Always use clipboard
 *
 * @param task - The task to send
 * @param storageManager - Storage manager to load codebase summary
 * @param outputChannel - Output channel for logging
 */
export async function sendTaskToCursor(
    task: Task,
    storageManager: StorageManager,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    try {
        outputChannel.appendLine(`Preparing task context for: "${task.title}"`);

        // Log available Cursor commands for debugging
        await discoverCursorCommands(outputChannel);

        // Load codebase summary
        let codebaseSummary = '';
        try {
            const summaryArtifact = await storageManager.getStoredArtifact('summary');
            if (summaryArtifact) {
                // Parse the content JSON to get summary text
                const summaryContent = JSON.parse(summaryArtifact.content);
                codebaseSummary = formatCodebaseSummary(summaryContent);
            }
        } catch (error) {
            outputChannel.appendLine('Note: Could not load codebase summary');
        }

        // Format the task context
        const context = formatTaskContext(task, codebaseSummary);

        // Get user preference
        const preference = getCursorIntegrationPreference();
        outputChannel.appendLine(`Cursor integration preference: ${preference}`);

        // Handle based on preference
        if (preference === 'clipboard') {
            // User explicitly wants clipboard only
            await copyToClipboardWithNotification(context, outputChannel);
            return;
        }

        if (preference === 'api') {
            // User explicitly wants API only
            const result = await sendToCursorChat(context, outputChannel);
            if (result.success) {
                vscode.window.showInformationMessage('Task sent to Cursor AI chat.');
            } else {
                // API-only mode failed - show error
                vscode.window.showWarningMessage(
                    `Cursor API not available. ${result.error || 'Try running in Cursor.'}`
                );
            }
            return;
        }

        // Default: 'auto' - try API first, fall back to clipboard
        const result = await sendToCursorChat(context, outputChannel);

        if (result.success && result.method === 'api') {
            vscode.window.showInformationMessage('Task sent to Cursor AI chat.');
            return;
        }

        // Fallback to clipboard
        await copyToClipboardWithNotification(context, outputChannel);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`[ERROR] Failed to send task context: ${message}`);
        vscode.window.showErrorMessage(`Failed to send task context: ${message}`);
    }
}

/**
 * Copy context to clipboard and show notification.
 */
async function copyToClipboardWithNotification(
    context: string,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    await vscode.env.clipboard.writeText(context);
    vscode.window.showInformationMessage('Task context copied. Paste into Cursor AI chat.');
    outputChannel.appendLine('Task context copied to clipboard');
}

/**
 * Format codebase summary from artifact content.
 */
function formatCodebaseSummary(summaryContent: any): string {
    const lines: string[] = [];

    if (summaryContent.projectName) {
        lines.push(`**Project:** ${summaryContent.projectName}`);
    }

    if (summaryContent.description) {
        lines.push(`**Description:** ${summaryContent.description}`);
    }

    if (summaryContent.techStack && Array.isArray(summaryContent.techStack)) {
        lines.push(`**Tech Stack:** ${summaryContent.techStack.join(', ')}`);
    }

    if (summaryContent.frameworks && Array.isArray(summaryContent.frameworks)) {
        lines.push(`**Frameworks:** ${summaryContent.frameworks.join(', ')}`);
    }

    if (summaryContent.entryPoints && Array.isArray(summaryContent.entryPoints)) {
        lines.push(`**Entry Points:** ${summaryContent.entryPoints.slice(0, 5).join(', ')}`);
    }

    return lines.join('\n');
}

/**
 * Format task context as markdown for Cursor AI.
 */
export function formatTaskContext(task: Task, codebaseSummary: string): string {
    const lines: string[] = [];

    // Codebase context section
    if (codebaseSummary) {
        lines.push('## Codebase Context');
        lines.push(codebaseSummary);
        lines.push('');
    }

    // Current task section
    lines.push('## Current Task');
    lines.push(`**${task.title}**`);
    if (task.description) {
        lines.push(task.description);
    }
    lines.push('');

    // Subtasks section
    if (task.subtasks && task.subtasks.length > 0) {
        lines.push('## Subtasks');
        task.subtasks.forEach(subtask => {
            const checkbox = subtask.completed ? '[x]' : '[ ]';
            lines.push(`- ${checkbox} ${subtask.title}`);
        });
        lines.push('');
    }

    // Acceptance criteria section
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        lines.push('## Acceptance Criteria');
        task.acceptanceCriteria.forEach(criterion => {
            lines.push(`- ${criterion}`);
        });
        lines.push('');
    }

    // Call to action
    lines.push('Help me implement this task.');

    return lines.join('\n');
}
