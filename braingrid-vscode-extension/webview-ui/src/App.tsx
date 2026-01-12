import { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import PhaseIndicator from './components/PhaseIndicator';
import TabNavigation, { TabType } from './components/TabNavigation';
import RequirementsTab from './components/RequirementsTab';
import TasksTab from './components/TasksTab';

/**
 * Conversation phases in the BrainGrid workflow.
 */
type ConversationPhase =
    | 'initial'
    | 'researching'
    | 'clarifying'
    | 'generating'
    | 'complete';

/**
 * Chat message structure.
 */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

/**
 * Subtask structure.
 */
interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

/**
 * Task structure.
 */
interface Task {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    subtasks: Subtask[];
    acceptanceCriteria: string[];
}

/**
 * Messages from extension to webview.
 */
type ExtensionMessage =
    | { type: 'addMessage'; role: 'user' | 'assistant'; content: string; id: string }
    | { type: 'updateMessage'; id: string; content: string }
    | { type: 'updatePhase'; phase: ConversationPhase }
    | { type: 'setLoading'; isLoading: boolean }
    | { type: 'clearMessages' }
    | { type: 'error'; message: string }
    | { type: 'artifactsReady'; hasRequirements: boolean; hasTasks: boolean }
    | { type: 'setSuggestions'; suggestions: string[] }
    | { type: 'setRequirements'; requirements: string | null }
    | { type: 'setTasks'; tasks: Task[] }
    | { type: 'actionResult'; action: 'copy' | 'claudeCode'; success: boolean; message?: string };

// Get VS Code API
const vscode = (typeof acquireVsCodeApi !== 'undefined')
    ? acquireVsCodeApi()
    : { postMessage: (msg: unknown) => console.log('vscode.postMessage:', msg) };

function App() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [phase, setPhase] = useState<ConversationPhase>('initial');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [artifactsAvailable, setArtifactsAvailable] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<TabType>('chat');
    const [requirements, setRequirements] = useState<string | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);

    // Toast notification state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

    // Scroll to bottom when messages change
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Auto-dismiss toast after 3 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Listen for messages from extension
    useEffect(() => {
        const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
            const message = event.data;

            switch (message.type) {
                case 'addMessage':
                    setMessages(prev => [...prev, {
                        id: message.id,
                        role: message.role,
                        content: message.content,
                        timestamp: new Date()
                    }]);
                    // Track streaming message (assistant with empty content)
                    if (message.role === 'assistant' && message.content === '') {
                        setStreamingMessageId(message.id);
                    }
                    setError(null);
                    break;

                case 'updateMessage':
                    // Update existing message content (streaming)
                    setMessages(prev => prev.map(msg =>
                        msg.id === message.id
                            ? { ...msg, content: message.content }
                            : msg
                    ));
                    break;

                case 'updatePhase':
                    setPhase(message.phase);
                    // Clear streaming when phase changes
                    if (message.phase !== 'clarifying' && message.phase !== 'generating') {
                        setStreamingMessageId(null);
                    }
                    break;

                case 'setLoading':
                    setIsLoading(message.isLoading);
                    if (!message.isLoading) {
                        setStreamingMessageId(null);
                    }
                    break;

                case 'clearMessages':
                    setMessages([]);
                    setError(null);
                    setArtifactsAvailable(false);
                    setStreamingMessageId(null);
                    break;

                case 'error':
                    setError(message.message);
                    setIsLoading(false);
                    setStreamingMessageId(null);
                    break;

                case 'artifactsReady':
                    setArtifactsAvailable(true);
                    setStreamingMessageId(null);
                    break;

                case 'setSuggestions':
                    setSuggestions(message.suggestions);
                    setSuggestionsLoading(false);
                    break;

                case 'setRequirements':
                    setRequirements(message.requirements);
                    break;

                case 'setTasks':
                    setTasks(message.tasks);
                    // Auto-switch to tasks tab when tasks arrive
                    if (message.tasks.length > 0) {
                        setActiveTab('tasks');
                    }
                    break;

                case 'actionResult':
                    // Show toast notification with message from extension
                    if (message.action === 'copy') {
                        setToast({ message: 'Prompt copied to clipboard!', type: 'success' });
                    } else if (message.action === 'claudeCode') {
                        // Claude Code opens in terminal
                        const toastMessage = message.message || (message.success
                            ? 'Opened Claude Code in terminal'
                            : 'Failed to open Claude Code');
                        setToast({ message: toastMessage, type: message.success ? 'success' : 'info' });
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);

        // Notify extension that webview is ready
        vscode.postMessage({ command: 'ready' });

        return () => window.removeEventListener('message', handleMessage);
    }, []);

    /**
     * Send a message to the extension.
     */
    const handleSendMessage = (text: string) => {
        if (!text.trim() || isLoading) return;
        vscode.postMessage({ command: 'sendMessage', text: text.trim() });
    };

    /**
     * Start a new conversation.
     */
    const handleNewConversation = () => {
        vscode.postMessage({ command: 'newConversation' });
    };

    /**
     * Dismiss error banner.
     */
    const handleDismissError = () => {
        setError(null);
    };

    /**
     * Handle example prompt click.
     */
    const handleExampleClick = (prompt: string) => {
        handleSendMessage(prompt);
    };

    /**
     * Toggle task completion.
     */
    const handleToggleTask = (taskId: string) => {
        vscode.postMessage({ command: 'toggleTask', taskId });
        // Optimistic update
        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
        ));
    };

    /**
     * Toggle subtask completion.
     */
    const handleToggleSubtask = (taskId: string, subtaskId: string) => {
        vscode.postMessage({ command: 'toggleSubtask', taskId, subtaskId });
        // Optimistic update
        setTasks(prev => prev.map(t =>
            t.id === taskId
                ? {
                    ...t,
                    subtasks: t.subtasks.map(s =>
                        s.id === subtaskId ? { ...s, completed: !s.completed } : s
                    )
                }
                : t
        ));
    };

    /**
     * Copy task prompt to clipboard.
     */
    const handleCopyPrompt = (taskId: string) => {
        vscode.postMessage({ command: 'copyTaskPrompt', taskId });
    };

    /**
     * Send task to Claude Code CLI.
     */
    const handleSendToClaudeCode = (taskId: string) => {
        vscode.postMessage({ command: 'sendTaskToClaudeCode', taskId });
    };

    const showWelcome = messages.length === 0 && !isLoading;
    const completedTasks = tasks.filter(t => t.completed).length;

    return (
        <div className="chat-container">
            {/* Header */}
            <div className="chat-header">
                <span className="chat-header-title">BrainGrid</span>
                <div className="chat-header-actions">
                    <PhaseIndicator phase={phase} />
                    <button
                        className="header-button"
                        onClick={handleNewConversation}
                        title="New Conversation"
                    >
                        New
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <TabNavigation
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab as TabType)}
                hasRequirements={!!requirements}
                hasTasks={tasks.length > 0}
                taskProgress={tasks.length > 0 ? { completed: completedTasks, total: tasks.length } : undefined}
            />

            {/* Error banner */}
            {error && (
                <div className="error-banner">
                    <span>{error}</span>
                    <button onClick={handleDismissError}>Dismiss</button>
                </div>
            )}

            {/* Tab Content */}
            {activeTab === 'chat' && (
                <div className="messages-container">
                {showWelcome ? (
                    <div className="welcome-message">
                        <h2 className="welcome-title">Welcome to BrainGrid</h2>
                        <p className="welcome-description">
                            Describe your project idea and I'll help you create
                            detailed requirements and tasks.
                        </p>
                        <div className="example-prompts">
                            {suggestionsLoading ? (
                                // Skeleton loading state
                                <>
                                    <div className="example-prompt skeleton" />
                                    <div className="example-prompt skeleton" />
                                    <div className="example-prompt skeleton" />
                                </>
                            ) : (
                                suggestions.map((prompt, index) => (
                                    <button
                                        key={index}
                                        className="example-prompt"
                                        onClick={() => handleExampleClick(prompt)}
                                    >
                                        {prompt}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((message) => (
                            <ChatMessage
                                key={message.id}
                                message={message}
                                isStreaming={message.id === streamingMessageId}
                            />
                        ))}
                        {isLoading && (
                            <div className="loading-indicator">
                                <div className="loading-spinner" />
                                <span>
                                    {phase === 'researching'
                                        ? 'Gathering domain knowledge...'
                                        : phase === 'generating'
                                        ? 'Creating requirements and tasks...'
                                        : 'Thinking...'}
                                </span>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
                </div>
            )}

            {activeTab === 'requirements' && (
                <RequirementsTab requirements={requirements} />
            )}

            {activeTab === 'tasks' && (
                <TasksTab
                    tasks={tasks}
                    onToggleTask={handleToggleTask}
                    onToggleSubtask={handleToggleSubtask}
                    onCopyPrompt={handleCopyPrompt}
                    onSendToClaudeCode={handleSendToClaudeCode}
                />
            )}

            {/* Artifacts ready banner - only show in chat tab */}
            {activeTab === 'chat' && artifactsAvailable && (
                <div className="artifacts-ready-banner">
                    <span>Requirements and tasks are ready!</span>
                    <button onClick={() => setActiveTab('tasks')}>View Tasks</button>
                </div>
            )}

            {/* Input area - only show in chat tab */}
            {activeTab === 'chat' && (
                <ChatInput
                    onSend={handleSendMessage}
                    disabled={isLoading}
                    placeholder={
                        showWelcome
                            ? 'Describe your project idea...'
                            : 'Type your message...'
                    }
                />
            )}

            {/* Toast notification */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    <span>{toast.message}</span>
                    <button className="toast-dismiss" onClick={() => setToast(null)}>×</button>
                </div>
            )}
        </div>
    );
}

export default App;
