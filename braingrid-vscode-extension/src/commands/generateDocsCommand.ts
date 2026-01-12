/**
 * Generate Documentation command handler.
 * Generates AI-powered markdown documentation from existing scan artifacts.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { StorageManager } from '../storage/StorageManager';
import { DocumentationGenerator } from '../scanner/generators/DocumentationGenerator';
import { ArtifactType, ArtifactResult } from '../scanner/types';

/**
 * Artifact types that can be converted to documentation.
 */
const DOCUMENTABLE_ARTIFACTS: ArtifactType[] = ['summary', 'dataModel', 'architecture', 'workflow'];

/**
 * Execute the generate documentation command.
 * Reads existing JSON artifacts and generates markdown documentation.
 * @param outputChannel - Output channel for logging
 */
export async function executeGenerateDocsCommand(
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
            placeHolder: 'Select workspace folder'
        });
        if (!selected) {
            return;
        }
        workspacePath = selected.path;
    }

    // Read configuration
    const config = vscode.workspace.getConfiguration('braingrid');
    const documentationApiEndpoint = config.get<string>(
        'documentationApiEndpoint',
        'http://localhost:3000/api/ai-documentation'
    );

    const startTime = Date.now();
    outputChannel.appendLine(`[${new Date().toISOString()}] Generating documentation for: ${workspacePath}`);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'BrainGrid: Generating Documentation',
            cancellable: true
        },
        async (progress, token) => {
            const storage = new StorageManager(workspacePath);

            // Check if artifacts exist
            const existingArtifacts = await storage.listStoredArtifacts();
            if (existingArtifacts.length === 0) {
                vscode.window.showWarningMessage(
                    'BrainGrid: No scan artifacts found. Please run "Scan Project" first.'
                );
                return;
            }

            // Filter to documentable artifacts (JSON only, not docs)
            const jsonArtifacts = existingArtifacts.filter(
                a => DOCUMENTABLE_ARTIFACTS.includes(a.type)
            );

            if (jsonArtifacts.length === 0) {
                vscode.window.showWarningMessage(
                    'BrainGrid: No documentable artifacts found. Please run "Scan Project" first.'
                );
                return;
            }

            outputChannel.appendLine(`  Found ${jsonArtifacts.length} artifacts to document`);
            progress.report({ message: 'Checking API availability...' });

            // Create documentation generator
            const docGenerator = new DocumentationGenerator(workspacePath, {
                apiEndpoint: documentationApiEndpoint,
                projectName: path.basename(workspacePath)
            });

            // Check API availability
            const apiAvailable = await docGenerator.checkApiAvailability();
            if (!apiAvailable) {
                vscode.window.showErrorMessage(
                    'BrainGrid: Documentation API not available. Ensure the development server is running at ' +
                    documentationApiEndpoint
                );
                outputChannel.appendLine('  [ERROR] Documentation API not available');
                return;
            }

            if (token.isCancellationRequested) {
                outputChannel.appendLine('  Cancelled by user');
                return;
            }

            // Prepare artifacts map
            const artifactsMap = new Map<string, string>();
            for (const artifact of jsonArtifacts) {
                if (!artifact.metadata.incomplete) {
                    artifactsMap.set(artifact.type, artifact.content);
                }
            }

            outputChannel.appendLine(`  Generating documentation for: ${[...artifactsMap.keys()].join(', ')}`);
            progress.report({ message: `Generating ${artifactsMap.size} documents...`, increment: 10 });

            try {
                // Generate documentation
                const docResults = await docGenerator.generateAll(artifactsMap);

                if (token.isCancellationRequested) {
                    outputChannel.appendLine('  Cancelled by user');
                    return;
                }

                // Store documentation artifacts
                let successCount = 0;
                let errorCount = 0;
                const totalDocs = docResults.size;
                let processed = 0;

                for (const [type, result] of docResults) {
                    processed++;
                    const pct = Math.round((processed / totalDocs) * 80) + 10;
                    progress.report({
                        message: `Saving ${type}...`,
                        increment: Math.round(80 / totalDocs)
                    });

                    try {
                        await storage.storeArtifact(type as ArtifactType, result);
                        successCount++;
                        outputChannel.appendLine(`  [OK] ${type}`);
                    } catch (storeError) {
                        errorCount++;
                        const msg = storeError instanceof Error ? storeError.message : String(storeError);
                        outputChannel.appendLine(`  [ERROR] ${type}: ${msg}`);
                    }
                }

                progress.report({ message: 'Complete', increment: 10 });

                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                outputChannel.appendLine(`Documentation generation completed in ${duration}s`);
                outputChannel.appendLine(`  Success: ${successCount}, Errors: ${errorCount}`);

                if (errorCount > 0) {
                    vscode.window.showWarningMessage(
                        `BrainGrid: Generated ${successCount} docs with ${errorCount} errors (${duration}s)`
                    );
                } else {
                    const action = await vscode.window.showInformationMessage(
                        `BrainGrid: Generated ${successCount} documentation files (${duration}s)`,
                        'View Artifacts'
                    );
                    if (action === 'View Artifacts') {
                        vscode.commands.executeCommand('braingrid.viewArtifacts');
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`[ERROR] Documentation generation failed: ${message}`);
                vscode.window.showErrorMessage(`BrainGrid: Documentation failed - ${message}`);
            }
        }
    );
}

/**
 * Register the generate docs command with VS Code.
 * @param context - Extension context for subscriptions
 * @param outputChannel - Output channel for logging
 */
export function registerGenerateDocsCommand(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): void {
    const disposable = vscode.commands.registerCommand('braingrid.generateDocs', () => {
        executeGenerateDocsCommand(outputChannel);
    });
    context.subscriptions.push(disposable);
}
