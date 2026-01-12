/**
 * ChatPanel - Webview panel for BrainGrid chat interface.
 *
 * Manages the lifecycle of the chat webview panel, including creation,
 * disposal, and message passing between the extension and the React UI.
 */
import * as vscode from 'vscode';
import { ExtensionMessage, WebviewMessage, ConversationPhase } from './types';
import { BrainGridClient, ChatMessage, ResearchResults, ParsedArtifacts } from '../api';
import { StorageManager } from '../storage';

/**
 * ChatPanel manages a webview-based chat interface.
 * Uses singleton pattern to ensure only one chat panel exists.
 */
export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    public static readonly viewType = 'braingridChat';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _outputChannel: vscode.OutputChannel | undefined;
    private _client: BrainGridClient;
    private _conversationHistory: ChatMessage[] = [];
    private _currentPhase: ConversationPhase = 'initial';
    private _researchResults: ResearchResults | null = null;
    private _storageManager: StorageManager | null = null;

    // Event emitter for session completion
    private _onSessionComplete = new vscode.EventEmitter<void>();
    public readonly onSessionComplete = this._onSessionComplete.event;

    /**
     * Create or show the chat panel.
     * If the panel already exists, it will be revealed.
     */
    public static createOrShow(
        context: vscode.ExtensionContext,
        outputChannel?: vscode.OutputChannel
    ): ChatPanel {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return ChatPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            'BrainGrid Chat',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')
                ]
            }
        );

        ChatPanel.currentPanel = new ChatPanel(panel, context.extensionUri, outputChannel);
        return ChatPanel.currentPanel;
    }

    /**
     * Get the current panel instance if it exists.
     */
    public static getCurrentPanel(): ChatPanel | undefined {
        return ChatPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        outputChannel?: vscode.OutputChannel
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._outputChannel = outputChannel;
        this._client = new BrainGridClient(undefined, outputChannel);

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._setMessageListener(this._panel.webview);

        this._log('ChatPanel created');
    }

    /**
     * Set the StorageManager for saving artifacts.
     */
    public setStorageManager(storage: StorageManager): void {
        this._storageManager = storage;
        this._log('StorageManager attached');
    }

    /**
     * Send a message to the webview.
     */
    public postMessage(message: ExtensionMessage): void {
        this._panel.webview.postMessage(message);
    }

    /**
     * Dispose of the panel and clean up resources.
     */
    public dispose(): void {
        ChatPanel.currentPanel = undefined;

        // Clean up resources
        this._panel.dispose();
        this._onSessionComplete.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        this._log('ChatPanel disposed');
    }

    /**
     * Log a message to the output channel if available.
     */
    private _log(message: string): void {
        if (this._outputChannel) {
            this._outputChannel.appendLine(`[ChatPanel] ${message}`);
        }
    }

    /**
     * Set up message listener for webview → extension communication.
     */
    private _setMessageListener(webview: vscode.Webview): void {
        webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                this._log(`Received message: ${JSON.stringify(message)}`);

                switch (message.command) {
                    case 'sendMessage':
                        this._handleSendMessage(message.text);
                        break;
                    case 'newConversation':
                        this._handleNewConversation();
                        break;
                    case 'viewArtifacts':
                        this._handleViewArtifacts();
                        break;
                    case 'ready':
                        this._handleWebviewReady();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Handle send message command from webview.
     */
    private async _handleSendMessage(text: string): Promise<void> {
        this._log(`User message: ${text}`);

        // Add user message to chat
        const userMessageId = this._generateId();
        this.postMessage({
            type: 'addMessage',
            role: 'user',
            content: text,
            id: userMessageId
        });

        // Add to conversation history
        this._conversationHistory.push({ role: 'user', content: text });

        // Show loading state
        this.postMessage({ type: 'setLoading', isLoading: true });

        try {
            if (this._currentPhase === 'initial') {
                await this._handleInitialPhase(text);
            } else {
                await this._handleChatPhase();
            }
        } catch (error) {
            this._handleError(error);
        } finally {
            this.postMessage({ type: 'setLoading', isLoading: false });
        }
    }

    /**
     * Handle initial phase - triggers research.
     */
    private async _handleInitialPhase(projectDescription: string): Promise<void> {
        // Transition to researching phase
        this._currentPhase = 'researching';
        this.postMessage({ type: 'updatePhase', phase: 'researching' });

        // Perform domain research
        this._researchResults = await this._client.research(projectDescription);

        // Save research to storage
        if (this._storageManager) {
            await this._storageManager.saveResearch(this._researchResults);
            this._log('Research saved to storage');
        }

        // Transition to clarifying phase
        this._currentPhase = 'clarifying';
        this.postMessage({ type: 'updatePhase', phase: 'clarifying' });

        // Start clarifying conversation with research context
        await this._handleChatPhase();
    }

    /**
     * Handle chat phase with streaming response.
     */
    private async _handleChatPhase(): Promise<void> {
        const assistantMessageId = this._generateId();

        // Add empty assistant message for streaming
        this.postMessage({
            type: 'addMessage',
            role: 'assistant',
            content: '',
            id: assistantMessageId
        });

        let fullContent = '';
        const researchContext = this._researchResults
            ? this._client.formatResearchContext(this._researchResults)
            : undefined;

        // Stream chat response
        await this._client.chatStream(
            {
                messages: this._conversationHistory,
                phase: this._currentPhase,
                researchContext
            },
            // On chunk
            (chunk) => {
                fullContent += chunk;
                this.postMessage({
                    type: 'updateMessage',
                    id: assistantMessageId,
                    content: fullContent
                });
            },
            // On complete
            async (finalContent) => {
                // Add to conversation history
                this._conversationHistory.push({ role: 'assistant', content: finalContent });

                // Parse for artifacts and phase transitions
                const artifacts = this._client.parseArtifacts(finalContent);

                // Handle ready to generate
                if (artifacts.readyToGenerate && this._currentPhase === 'clarifying') {
                    this._currentPhase = 'generating';
                    this.postMessage({ type: 'updatePhase', phase: 'generating' });

                    // Trigger generation automatically
                    await this._handleChatPhase();
                    return;
                }

                // Handle generated artifacts
                if (artifacts.requirements || artifacts.tasks) {
                    await this._saveArtifacts(artifacts);

                    this._currentPhase = 'complete';
                    this.postMessage({ type: 'updatePhase', phase: 'complete' });
                    this.postMessage({
                        type: 'artifactsReady',
                        hasRequirements: !!artifacts.requirements,
                        hasTasks: !!artifacts.tasks
                    });

                    // Fire session complete event for external listeners
                    this._onSessionComplete.fire();
                }
            }
        );
    }

    /**
     * Save artifacts to StorageManager.
     */
    private async _saveArtifacts(artifacts: ParsedArtifacts): Promise<void> {
        if (!this._storageManager) {
            this._log('No StorageManager available - artifacts not saved');
            return;
        }

        if (artifacts.requirements) {
            await this._storageManager.saveRequirements(artifacts.requirements);
            this._log('Requirements saved');
        }

        if (artifacts.tasks) {
            await this._storageManager.saveTasks(artifacts.tasks);
            this._log(`Saved ${artifacts.tasks.length} tasks`);
        }
    }

    /**
     * Handle API errors.
     */
    private _handleError(error: unknown): void {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this._log(`Error: ${message}`);

        let userMessage = message;
        if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED')) {
            userMessage = 'Cannot connect to BrainGrid server. Make sure the backend is running on localhost:3000';
        }

        this.postMessage({
            type: 'error',
            message: userMessage
        });
    }

    /**
     * Handle new conversation command from webview.
     */
    private _handleNewConversation(): void {
        this._log('Starting new conversation');

        // Reset conversation state
        this._conversationHistory = [];
        this._currentPhase = 'initial';
        this._researchResults = null;

        this.postMessage({ type: 'clearMessages' });
        this.postMessage({ type: 'updatePhase', phase: 'initial' });
    }

    /**
     * Handle view artifacts command from webview.
     */
    private _handleViewArtifacts(): void {
        this._log('Opening artifacts view');
        vscode.commands.executeCommand('braingrid.viewArtifacts');
    }

    /**
     * Handle webview ready event.
     */
    private _handleWebviewReady(): void {
        this._log('Webview is ready');
        // Send initial state
        this.postMessage({ type: 'updatePhase', phase: 'initial' });
    }

    /**
     * Generate a unique ID for messages.
     */
    private _generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }

    /**
     * Generate the HTML content for the webview.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get URIs for webview resources
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'main.css')
        );

        // Use a nonce to whitelist which scripts can be run
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>BrainGrid Chat</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for script security.
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
