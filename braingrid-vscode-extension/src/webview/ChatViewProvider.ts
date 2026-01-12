/**
 * ChatViewProvider - Webview view provider for BrainGrid chat in sidebar.
 *
 * Provides a chat interface embedded in the VS Code sidebar,
 * allowing users to chat while viewing files (Copilot-style).
 */
import * as vscode from 'vscode';
import { ExtensionMessage, WebviewMessage, ConversationPhase, Task } from './types';
import { BrainGridClient, ChatMessage, ResearchResults, ParsedArtifacts, CachedSuggestions } from '../api';
import { StorageManager } from '../storage';
import { formatTaskContext } from '../commands/taskCommands';

/**
 * ChatViewProvider provides a webview-based chat interface in the sidebar.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'braingridChat';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private _client: BrainGridClient;
    private _conversationHistory: ChatMessage[] = [];
    private _currentPhase: ConversationPhase = 'initial';
    private _researchResults: ResearchResults | null = null;
    private _storageManager: StorageManager | null = null;
    private _codebaseContext: string | undefined;
    private _cachedSuggestions: CachedSuggestions | null = null;
    private _suggestionsLoading: boolean = false;

    // Event emitter for session completion
    private _onSessionComplete = new vscode.EventEmitter<void>();
    public readonly onSessionComplete = this._onSessionComplete.event;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _outputChannel?: vscode.OutputChannel
    ) {
        this._client = new BrainGridClient(undefined, _outputChannel);
    }

    /**
     * Called when VS Code needs to resolve the webview view.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'out', 'webview')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        this._setMessageListener(webviewView.webview);

        // Handle disposal
        webviewView.onDidDispose(() => {
            this._disposables.forEach(d => d.dispose());
            this._disposables = [];
        });

        this._log('ChatViewProvider resolved');
    }

    /**
     * Set the StorageManager for saving artifacts.
     */
    public setStorageManager(storage: StorageManager): void {
        this._storageManager = storage;
        this._log('StorageManager attached');

        // Refresh suggestions now that storage is available
        // (initial load may have happened before storage was ready)
        this._cachedSuggestions = null; // Invalidate cache
        this._codebaseContext = undefined; // Clear to reload from artifacts
        this._loadAndSendSuggestions();

        // Load and send existing artifacts to webview
        this._loadAndSendArtifacts();
    }

    /**
     * Load existing artifacts from storage and send to webview.
     */
    private async _loadAndSendArtifacts(): Promise<void> {
        if (!this._storageManager || !this._view) {
            return;
        }

        try {
            const requirements = await this._storageManager.loadRequirements();
            const tasks = await this._storageManager.loadTasks();

            if (requirements) {
                this.postMessage({ type: 'setRequirements', requirements });
                this._log('Sent existing requirements to webview');
            }

            if (tasks && tasks.length > 0) {
                this.postMessage({ type: 'setTasks', tasks: this._formatTasksForWebview(tasks) });
                this._log(`Sent ${tasks.length} existing tasks to webview`);
            }
        } catch (error) {
            this._log(`Failed to load existing artifacts: ${error}`);
        }
    }

    /**
     * Send a message to the webview.
     */
    public postMessage(message: ExtensionMessage): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    /**
     * Focus the chat view (reveals and focuses).
     */
    public focus(): void {
        if (this._view) {
            this._view.show?.(true);
        }
    }

    /**
     * Dispose of resources.
     */
    public dispose(): void {
        this._onSessionComplete.dispose();
        this._disposables.forEach(d => d.dispose());
        this._log('ChatViewProvider disposed');
    }

    /**
     * Log a message to the output channel if available.
     */
    private _log(message: string): void {
        if (this._outputChannel) {
            this._outputChannel.appendLine(`[ChatViewProvider] ${message}`);
        }
    }

    /**
     * Set up message listener for webview → extension communication.
     */
    private _setMessageListener(webview: vscode.Webview): void {
        const listener = webview.onDidReceiveMessage(
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
                    case 'copyTaskPrompt':
                        this._handleCopyTaskPrompt(message.taskId);
                        break;
                    case 'sendTaskToClaudeCode':
                        this._handleSendTaskToClaudeCode(message.taskId);
                        break;
                    case 'toggleTask':
                        this._handleToggleTask(message.taskId);
                        break;
                    case 'toggleSubtask':
                        this._handleToggleSubtask(message.taskId, message.subtaskId);
                        break;
                }
            }
        );
        this._disposables.push(listener);
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
     * Load codebase context from scan artifacts.
     */
    private async _loadCodebaseContext(): Promise<void> {
        if (!this._storageManager) return;

        this._codebaseContext = await this._client.formatCodebaseContext(this._storageManager);
        if (this._codebaseContext) {
            this._log(`Loaded codebase context: ${this._codebaseContext.length} chars`);
        }
    }

    /**
     * Handle initial phase - triggers research.
     */
    private async _handleInitialPhase(projectDescription: string): Promise<void> {
        // Load codebase context from scan artifacts first
        await this._loadCodebaseContext();

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

        // Stream chat response with both research and codebase context
        await this._client.chatStream(
            {
                messages: this._conversationHistory,
                phase: this._currentPhase,
                researchContext,
                codebaseContext: this._codebaseContext
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
            // Send to webview for display in tabs
            this.postMessage({ type: 'setRequirements', requirements: artifacts.requirements });
        }

        if (artifacts.tasks) {
            await this._storageManager.saveTasks(artifacts.tasks);
            this._log(`Saved ${artifacts.tasks.length} tasks`);
            // Send to webview for display in tabs
            this.postMessage({ type: 'setTasks', tasks: this._formatTasksForWebview(artifacts.tasks) });
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
        this._codebaseContext = undefined;

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
        // Load and send suggestions
        this._loadAndSendSuggestions();
        // Load existing artifacts from storage
        this._loadAndSendArtifacts();
    }

    /**
     * Get the latest artifact timestamp for cache invalidation.
     */
    private async _getArtifactTimestamp(): Promise<string | null> {
        if (!this._storageManager) return null;

        const artifacts = await this._storageManager.listStoredArtifacts();
        if (artifacts.length === 0) return null;

        // Find the most recent artifact by parsing metadata timestamps
        let latestTimestamp: Date | null = null;
        for (const artifact of artifacts) {
            try {
                const ts = new Date(artifact.metadata.generatedAt);
                if (!latestTimestamp || ts > latestTimestamp) {
                    latestTimestamp = ts;
                }
            } catch {
                // Skip artifacts with invalid timestamps
            }
        }

        return latestTimestamp ? latestTimestamp.toISOString() : null;
    }

    /**
     * Load suggestions from cache or API, then send to webview.
     */
    private async _loadAndSendSuggestions(): Promise<void> {
        // Prevent concurrent fetches
        if (this._suggestionsLoading) {
            this._log('Suggestions already loading, skipping');
            return;
        }

        try {
            this._suggestionsLoading = true;
            const currentTimestamp = await this._getArtifactTimestamp();

            // Check if cached suggestions are still valid
            if (this._cachedSuggestions) {
                if (currentTimestamp === this._cachedSuggestions.artifactTimestamp) {
                    this._log('Using cached suggestions');
                    this.postMessage({
                        type: 'setSuggestions',
                        suggestions: this._cachedSuggestions.suggestions
                    });
                    return;
                }
                this._log('Artifacts changed, refreshing suggestions');
            }

            // Load codebase context if not already loaded
            if (!this._codebaseContext && this._storageManager) {
                this._codebaseContext = await this._client.formatCodebaseContext(this._storageManager);
            }

            // Fetch new suggestions from API
            const response = await this._client.fetchSuggestions(this._codebaseContext);

            // Cache the suggestions with current artifact timestamp
            this._cachedSuggestions = {
                suggestions: response.suggestions,
                artifactTimestamp: currentTimestamp || ''
            };

            this._log(`Loaded suggestions (fromCodebase: ${response.fromCodebase})`);
            this.postMessage({
                type: 'setSuggestions',
                suggestions: response.suggestions
            });
        } catch (error) {
            this._log(`Failed to load suggestions: ${error}`);
            // Send default suggestions on error
            this.postMessage({
                type: 'setSuggestions',
                suggestions: [
                    'Build a todo app with user authentication',
                    'Create an API for managing inventory',
                    'Design a real-time chat application'
                ]
            });
        } finally {
            this._suggestionsLoading = false;
        }
    }

    /**
     * Handle copy task prompt to clipboard.
     */
    private async _handleCopyTaskPrompt(taskId: string): Promise<void> {
        if (!this._storageManager) {
            this._log('No StorageManager available for copy task prompt');
            return;
        }

        try {
            const tasks = await this._storageManager.loadTasks();
            const task = tasks?.find(t => t.id === taskId);
            if (!task) {
                this._log(`Task not found: ${taskId}`);
                return;
            }

            // Get codebase summary for context
            let codebaseSummary = '';
            try {
                const summaryArtifact = await this._storageManager.getStoredArtifact('summary');
                if (summaryArtifact) {
                    const content = JSON.parse(summaryArtifact.content);
                    codebaseSummary = this._formatCodebaseSummary(content);
                }
            } catch {
                this._log('Could not load codebase summary');
            }

            const prompt = formatTaskContext(task, codebaseSummary);
            await vscode.env.clipboard.writeText(prompt);

            this.postMessage({
                type: 'actionResult',
                action: 'copy',
                success: true,
                message: 'Copied to clipboard'
            });

            this._log(`Copied prompt for task: ${task.title}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error copying task prompt: ${message}`);
            this.postMessage({
                type: 'actionResult',
                action: 'copy',
                success: false,
                message: 'Failed to copy prompt'
            });
        }
    }

    /**
     * Handle send task to Claude Code CLI.
     * Opens a VS Code terminal and runs claude with the prompt.
     */
    private async _handleSendTaskToClaudeCode(taskId: string): Promise<void> {
        if (!this._storageManager) {
            this._log('Missing StorageManager for send to Claude Code');
            return;
        }

        try {
            const tasks = await this._storageManager.loadTasks();
            const task = tasks?.find(t => t.id === taskId);
            if (!task) {
                this._log(`Task not found: ${taskId}`);
                return;
            }

            // Get codebase summary for context
            let codebaseSummary = '';
            try {
                const summaryArtifact = await this._storageManager.getStoredArtifact('summary');
                if (summaryArtifact) {
                    const content = JSON.parse(summaryArtifact.content);
                    codebaseSummary = this._formatCodebaseSummary(content);
                }
            } catch {
                this._log('Could not load codebase summary for Claude Code');
            }

            const prompt = formatTaskContext(task, codebaseSummary);

            // Write prompt to a temp file to handle special characters properly
            const fs = await import('fs');
            const os = await import('os');
            const path = await import('path');

            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, 'braingrid-claude-prompt.txt');
            fs.writeFileSync(tempFile, prompt, 'utf8');

            // Create or reuse terminal
            const terminalName = 'Claude Code - BrainGrid';
            let terminal = vscode.window.terminals.find(t => t.name === terminalName);

            if (!terminal) {
                terminal = vscode.window.createTerminal({
                    name: terminalName,
                    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
                });
            }

            terminal.show();

            // Small delay to ensure terminal is ready before sending command
            await new Promise(resolve => setTimeout(resolve, 500));

            // Use cat to pipe the prompt file to claude - handles all special characters
            // Second parameter `true` ensures newline is sent to execute the command
            terminal.sendText(`cat "${tempFile}" | claude`, true);

            this.postMessage({
                type: 'actionResult',
                action: 'claudeCode',
                success: true,
                message: 'Opened Claude Code in terminal'
            });
            this._log(`Sent task to Claude Code terminal: ${task.title}`);

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error sending to Claude Code: ${message}`);
            this.postMessage({
                type: 'actionResult',
                action: 'claudeCode',
                success: false,
                message: 'Failed to open Claude Code'
            });
        }
    }

    /**
     * Handle toggle task completion.
     */
    private async _handleToggleTask(taskId: string): Promise<void> {
        if (!this._storageManager) {
            this._log('No StorageManager available for toggle task');
            return;
        }

        try {
            const tasks = await this._storageManager.loadTasks();
            const task = tasks?.find(t => t.id === taskId);
            if (!task) {
                this._log(`Task not found: ${taskId}`);
                return;
            }

            // Toggle completion
            task.completed = !task.completed;

            // When toggling parent, update all subtasks to match
            if (task.subtasks && task.subtasks.length > 0) {
                task.subtasks.forEach(s => {
                    s.completed = task.completed;
                });
            }

            // Save updated tasks
            await this._storageManager.saveTasks(tasks);

            // Send updated tasks to webview
            this.postMessage({ type: 'setTasks', tasks: this._formatTasksForWebview(tasks) });

            this._log(`Toggled task "${task.title}" to ${task.completed ? 'completed' : 'incomplete'}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error toggling task: ${message}`);
        }
    }

    /**
     * Handle toggle subtask completion.
     */
    private async _handleToggleSubtask(taskId: string, subtaskId: string): Promise<void> {
        if (!this._storageManager) {
            this._log('No StorageManager available for toggle subtask');
            return;
        }

        try {
            const tasks = await this._storageManager.loadTasks();
            const task = tasks?.find(t => t.id === taskId);
            if (!task) {
                this._log(`Task not found: ${taskId}`);
                return;
            }

            const subtask = task.subtasks?.find(s => s.id === subtaskId);
            if (!subtask) {
                this._log(`Subtask not found: ${subtaskId}`);
                return;
            }

            // Toggle subtask completion
            subtask.completed = !subtask.completed;

            // Update parent task based on subtask states
            if (task.subtasks && task.subtasks.length > 0) {
                const allComplete = task.subtasks.every(s => s.completed);
                task.completed = allComplete;
            }

            // Save updated tasks
            await this._storageManager.saveTasks(tasks);

            // Send updated tasks to webview
            this.postMessage({ type: 'setTasks', tasks: this._formatTasksForWebview(tasks) });

            this._log(`Toggled subtask "${subtask.title}" to ${subtask.completed ? 'completed' : 'incomplete'}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._log(`Error toggling subtask: ${message}`);
        }
    }

    /**
     * Format codebase summary from artifact content.
     */
    private _formatCodebaseSummary(summaryContent: any): string {
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
     * Format tasks from storage format to webview format.
     */
    private _formatTasksForWebview(tasks: Task[]): Task[] {
        return tasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description || '',
            completed: task.completed || false,
            subtasks: (task.subtasks || []).map(s => ({
                id: s.id,
                title: s.title,
                completed: s.completed || false
            })),
            acceptanceCriteria: task.acceptanceCriteria || []
        }));
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
