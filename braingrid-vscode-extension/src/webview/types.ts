/**
 * Message protocol types for extension ↔ webview communication.
 */

/**
 * Conversation phases in the BrainGrid workflow.
 */
export type ConversationPhase =
    | 'initial'
    | 'researching'
    | 'clarifying'
    | 'generating'
    | 'complete';

/**
 * Chat message structure.
 */
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

/**
 * Subtask structure for tasks.
 */
export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

/**
 * Task structure for the tasks tab.
 */
export interface Task {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    subtasks: Subtask[];
    acceptanceCriteria: string[];
}

/**
 * Messages sent from extension to webview.
 */
export type ExtensionMessage =
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

/**
 * Messages sent from webview to extension.
 */
export type WebviewMessage =
    | { command: 'sendMessage'; text: string }
    | { command: 'newConversation' }
    | { command: 'viewArtifacts' }
    | { command: 'ready' }
    | { command: 'copyTaskPrompt'; taskId: string }
    | { command: 'sendTaskToClaudeCode'; taskId: string }
    | { command: 'toggleTask'; taskId: string }
    | { command: 'toggleSubtask'; taskId: string; subtaskId: string };
