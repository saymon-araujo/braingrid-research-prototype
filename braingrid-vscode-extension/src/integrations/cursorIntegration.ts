/**
 * Cursor AI Integration Module
 *
 * Provides functionality to send context to Cursor's AI chat interface.
 * Uses a hybrid approach: attempts direct API integration when available,
 * falls back to clipboard when API is unavailable.
 *
 * Note: Cursor's extension API is not officially documented. This module
 * uses best-effort detection of available commands and graceful fallback.
 *
 * @see docs/cursor-api-research.md for full research documentation
 */
import * as vscode from 'vscode';

/**
 * Result of attempting to send context to Cursor.
 */
export interface CursorSendResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Method used: 'api' for direct integration, 'clipboard' for fallback */
    method: 'api' | 'clipboard';
    /** Error message if operation failed */
    error?: string;
}

/**
 * Known Cursor command namespaces to search for.
 */
const CURSOR_COMMAND_PATTERNS = [
    'cursor.',
    'aichat.',
    'composer.',
    'cursorai.'
];

/**
 * Check if the current environment appears to be Cursor.
 * This is a heuristic based on available commands.
 */
export async function isCursorEnvironment(): Promise<boolean> {
    const commands = await vscode.commands.getCommands(true);
    return commands.some(cmd =>
        CURSOR_COMMAND_PATTERNS.some(pattern => cmd.startsWith(pattern))
    );
}

/**
 * Discover Cursor-related commands available in the current environment.
 * Useful for debugging and research purposes.
 *
 * @param outputChannel Optional output channel for logging
 * @returns Array of Cursor-related command identifiers
 */
export async function discoverCursorCommands(
    outputChannel?: vscode.OutputChannel
): Promise<string[]> {
    const commands = await vscode.commands.getCommands(true);

    const cursorCommands = commands.filter(cmd =>
        CURSOR_COMMAND_PATTERNS.some(pattern =>
            cmd.toLowerCase().startsWith(pattern.toLowerCase())
        ) ||
        cmd.toLowerCase().includes('cursor') ||
        cmd.toLowerCase().includes('aichat') ||
        cmd.toLowerCase().includes('composer')
    ).sort();

    if (outputChannel) {
        outputChannel.appendLine('=== Cursor Command Discovery ===');
        if (cursorCommands.length === 0) {
            outputChannel.appendLine('  No Cursor-specific commands found');
            outputChannel.appendLine('  (This is expected in VS Code - Cursor commands only available in Cursor)');
        } else {
            cursorCommands.forEach(cmd => outputChannel.appendLine(`  - ${cmd}`));
        }
        outputChannel.appendLine('================================');
    }

    return cursorCommands;
}

/**
 * Prepare text for Cursor AI chat by copying to clipboard and focusing the panel.
 *
 * NOTE: Cursor does NOT have a public API to inject text into the chat input.
 * Commands like aichat.newchataction, aichat.sendMessage, cursor.newChat exist
 * but they do NOT accept text parameters for injection - they only open panels.
 *
 * The best we can do is:
 * 1. Copy the text to clipboard
 * 2. Focus the Cursor AI chat panel
 * 3. User pastes with Cmd+V / Ctrl+V
 *
 * @param context The context string to send to Cursor
 * @param outputChannel Optional output channel for logging
 * @returns Result indicating whether panel was focused
 */
export async function sendToCursorChat(
    context: string,
    outputChannel?: vscode.OutputChannel
): Promise<CursorSendResult> {
    try {
        // Always copy to clipboard first
        await vscode.env.clipboard.writeText(context);
        outputChannel?.appendLine('Copied prompt to clipboard');

        const commands = await vscode.commands.getCommands(true);
        let panelFocused = false;

        // Try to focus the Cursor AI chat panel
        // Note: These commands open/focus the panel but do NOT inject text
        const focusCommands = [
            'aichat.newchataction',  // Opens new chat
            'aichat.focus',           // Focuses existing chat
            'cursor.newChat'          // Opens new chat (alternative)
        ];

        for (const cmd of focusCommands) {
            if (commands.includes(cmd)) {
                try {
                    await vscode.commands.executeCommand(cmd);
                    outputChannel?.appendLine(`Focused Cursor AI panel via ${cmd}`);
                    panelFocused = true;
                    break;
                } catch (error) {
                    outputChannel?.appendLine(`${cmd} failed: ${error}`);
                    // Continue to next method
                }
            }
        }

        if (!panelFocused) {
            outputChannel?.appendLine('Could not focus Cursor AI panel - user must open it manually');
        }

        // Always return clipboard method since that's what actually transfers the text
        return {
            success: panelFocused,
            method: 'clipboard',
            error: panelFocused ? undefined : 'Could not focus Cursor panel'
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel?.appendLine(`Cursor integration error: ${message}`);
        return {
            success: false,
            method: 'clipboard',
            error: message
        };
    }
}

/**
 * Get the user's preferred Cursor integration method from settings.
 *
 * @returns 'auto' | 'api' | 'clipboard'
 */
export function getCursorIntegrationPreference(): 'auto' | 'api' | 'clipboard' {
    const config = vscode.workspace.getConfiguration('braingrid');
    return config.get<'auto' | 'api' | 'clipboard'>('cursorIntegration', 'auto');
}
