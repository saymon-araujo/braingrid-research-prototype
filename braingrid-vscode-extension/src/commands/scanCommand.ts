/**
 * Scan command handler with VS Code progress UI.
 */
import * as vscode from 'vscode';
import { ScanOrchestrator } from '../scanner/ScanOrchestrator';

/**
 * Execute the scan command with progress UI and cancellation support.
 * @param outputChannel - Output channel for logging
 */
export async function executeScanCommand(
    outputChannel: vscode.OutputChannel
): Promise<void> {
    // Validate workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('BrainGrid: No workspace folder open');
        return;
    }

    // Select workspace folder (if multiple)
    let workspacePath: string;
    if (workspaceFolders.length === 1) {
        workspacePath = workspaceFolders[0].uri.fsPath;
    } else {
        const items = workspaceFolders.map(f => ({
            label: f.name,
            path: f.uri.fsPath
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select workspace folder to scan'
        });
        if (!selected) {
            return;
        }
        workspacePath = selected.path;
    }

    // Read configuration settings
    const config = vscode.workspace.getConfiguration('braingrid');
    const generateDocumentation = config.get<boolean>('generateDocumentation', false);
    const documentationApiEndpoint = config.get<string>('documentationApiEndpoint', 'http://localhost:3000/api/ai-documentation');

    // Run scan with progress UI
    const startTime = Date.now();
    outputChannel.appendLine(`[${new Date().toISOString()}] Starting scan: ${workspacePath}`);
    outputChannel.appendLine(`  Documentation generation: ${generateDocumentation ? 'enabled' : 'disabled'}`);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'BrainGrid: Scanning Project',
            cancellable: true
        },
        async (progress, token) => {
            const orchestrator = new ScanOrchestrator(workspacePath, {
                generateDocumentation,
                documentationApiEndpoint
            });
            let lastProgress = 0;

            // Wire progress callback
            orchestrator.onProgress((stage, percent, message) => {
                const increment = percent - lastProgress;
                lastProgress = percent;
                progress.report({ message: message || stage, increment });
                outputChannel.appendLine(`  [${stage}] ${percent}% - ${message || ''}`);
            });

            // Wire cancellation
            orchestrator.setCancellationToken(token);

            try {
                const result = await orchestrator.scanWorkspace();
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                if (result.cancelled) {
                    outputChannel.appendLine(`Scan cancelled after ${duration}s`);
                    vscode.window.showInformationMessage('BrainGrid: Scan cancelled');
                    return;
                }

                // Log results
                const artifactCount = Object.keys(result.artifacts).length;
                outputChannel.appendLine(`Scan completed in ${duration}s`);
                outputChannel.appendLine(`  Artifacts: ${artifactCount}`);
                outputChannel.appendLine(`  Errors: ${result.errors.length}`);

                if (result.errors.length > 0) {
                    for (const err of result.errors) {
                        outputChannel.appendLine(`  [ERROR] ${err.stage}: ${err.message}`);
                    }
                    vscode.window.showWarningMessage(
                        `BrainGrid: Scan completed with ${result.errors.length} errors (${duration}s)`
                    );
                } else {
                    const action = await vscode.window.showInformationMessage(
                        `BrainGrid: Scan complete (${duration}s, ${artifactCount} artifacts)`,
                        'View Artifacts'
                    );
                    if (action === 'View Artifacts') {
                        vscode.commands.executeCommand('braingrid.viewArtifacts');
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`[ERROR] Scan failed: ${message}`);
                vscode.window.showErrorMessage(`BrainGrid: Scan failed - ${message}`);
            }
        }
    );
}

/**
 * Register the scan command with VS Code.
 * @param context - Extension context for subscriptions
 * @param outputChannel - Output channel for logging
 */
export function registerScanCommand(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): void {
    const disposable = vscode.commands.registerCommand('braingrid.scan', () => {
        executeScanCommand(outputChannel);
    });
    context.subscriptions.push(disposable);
}
