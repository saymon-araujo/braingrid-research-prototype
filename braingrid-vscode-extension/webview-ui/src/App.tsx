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
                <svg
                    className="chat-header-logo"
                    viewBox="0 0 1200 209"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M253.836 22L224.722 187L133.208 209H108.17L145.049 0H170.086L253.836 22ZM131.521 17.4413L100.796 191.568L74.189 198.005H51.9332L84.9295 11.0046H107.185L131.521 17.4413ZM876.589 18.5243C907.161 18.5243 927.982 33.7625 920.505 74.7882L874.111 83.931C878.503 59.3156 878.415 51.3449 870.184 51.3449C861.953 51.3449 857.797 55.7991 848.657 106.671C840.705 150.979 845.233 155.199 851.178 156.136C858.785 157.309 864.32 152.385 866.508 139.961L869.084 126.363H854.503L860.066 94.9493H918.153L912.082 129.177C904.436 171.14 880.519 188.957 846.184 188.957C805.97 188.957 792.538 165.045 803.406 105.264C814.87 40.561 839.667 18.5243 876.589 18.5243ZM357.576 22.5073C384.856 22.5073 400.508 44.5441 395.591 71.7383C393.589 83.4599 387.994 94.2439 380.119 102.683C389.394 110.889 393.84 124.017 390.925 139.489C386.008 166.684 362.239 186.61 334.96 186.61H276.637L306.309 22.5073H357.576ZM472.415 22.5073C500.871 22.5074 519.493 46.6539 514.286 76.4269C510.556 97.057 501.357 113.467 487.498 123.782L497.303 186.61H454.267L446.206 135.27H442.914L433.572 186.61H391.241L420.913 22.5073H472.415ZM611.068 186.61H568.267L571.871 150.742H550.941L541.927 186.61H499.126L542.438 22.5073H624.983L611.068 186.61ZM659.543 186.61H617.213L646.884 22.5073H689.215L659.543 186.61ZM754.221 97.9947L767.987 22.5073H809.142L779.706 186.61H736.905L726.897 104.09L711.977 186.61H670.822L700.494 22.5073H745.176L754.221 97.9947ZM992.856 22.5073C1021.31 22.5073 1039.93 46.6539 1034.73 76.4269C1031 97.057 1021.8 113.467 1007.94 123.782L1017.74 186.61H974.707L966.646 135.27H963.354L954.012 186.61H911.681L941.353 22.5073H992.856ZM1066.49 186.61H1024.16L1053.83 22.5073H1096.16L1066.49 186.61ZM1142.33 22.5073C1190.54 22.5073 1206.05 59.3133 1197.96 105.028C1189.81 149.804 1162.05 186.61 1112.9 186.61H1076.92L1106.59 22.5073H1142.33ZM71.0533 30.4383L44.9156 178.568L19.1261 184.803H0L28.3381 24.2033H47.4642L71.0533 30.4383ZM323.491 153.79H331.722C340.659 153.79 348.966 148.163 350.799 137.379C352.866 126.596 346.374 121.204 337.438 121.204H329.207L323.491 153.79ZM1124.58 148.632C1145.44 144.178 1150.61 124.017 1153.66 107.138C1157.51 84.8665 1158.49 65.1741 1140.52 60.4855L1124.58 148.632ZM559.582 116.281H575.339L581.35 57.6723H574.06L559.582 116.281ZM449.187 100.573H449.893C459.3 100.573 469.691 94.4783 472.945 77.1302C474.761 66.1119 467.099 57.4379 457.692 57.4379H456.987L449.187 100.573ZM969.627 100.573H970.333C979.74 100.573 990.131 94.4783 993.385 77.1302C995.201 66.1119 987.539 57.4379 978.132 57.4379H977.427L969.627 100.573ZM334.802 90.2584H335.978C344.914 90.2584 353.238 84.8665 355.475 73.1449C357.477 61.4232 351.407 55.3279 342.235 55.3279H341.059L334.802 90.2584Z"
                        fill="#C2E476"
                    />
                </svg>
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
