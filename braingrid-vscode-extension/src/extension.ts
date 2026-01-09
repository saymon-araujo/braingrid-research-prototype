import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    try {
        // Create output channel
        outputChannel = vscode.window.createOutputChannel('BrainGrid');
        context.subscriptions.push(outputChannel);

        // Log activation
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`BrainGrid extension activated at ${timestamp}`);

        // Register commands
        const commands = [
            { id: 'braingrid.scan', name: 'Scan' },
            { id: 'braingrid.sync', name: 'Sync' },
            { id: 'braingrid.openChat', name: 'Open Chat' },
            { id: 'braingrid.viewArtifacts', name: 'View Artifacts' },
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

        outputChannel.appendLine(`Registered ${commands.length} commands`);

        // Show output channel
        outputChannel.show(true);

    } catch (error) {
        console.error('BrainGrid activation failed:', error);
        vscode.window.showErrorMessage(`BrainGrid extension failed to activate: ${error}`);
    }
}

export function deactivate() {
    // Resources are automatically disposed via context.subscriptions
}
