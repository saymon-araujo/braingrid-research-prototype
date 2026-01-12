/**
 * API types for BrainGrid backend communication.
 */

/**
 * Research finding from Perplexity + Claude analysis.
 */
export interface ResearchFinding {
    id: string;
    category: 'concept' | 'best_practice' | 'pitfall' | 'edge_case' | 'technical';
    title: string;
    content: string;
    source?: string;
    relevance: 'high' | 'medium' | 'low';
}

/**
 * Complete research results from /api/research.
 */
export interface ResearchResults {
    query: string;
    findings: ResearchFinding[];
    summary: string;
    suggestedQuestions: string[];
    timestamp: Date;
}

/**
 * Conversation phase for AI interaction.
 */
export type ConversationPhase =
    | 'initial'
    | 'researching'
    | 'clarifying'
    | 'generating'
    | 'complete';

/**
 * Chat message for API communication.
 */
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Request body for /api/chat.
 */
export interface ChatRequest {
    messages: ChatMessage[];
    phase: ConversationPhase;
    researchContext?: string;    // Web research from Perplexity
    codebaseContext?: string;    // Scan artifacts from local codebase analysis
}

/**
 * Request body for /api/research.
 */
export interface ResearchRequest {
    projectDescription: string;
}

/**
 * Parsed artifacts from AI response.
 */
export interface ParsedArtifacts {
    requirements?: string;
    tasks?: Task[];
    readyToGenerate: boolean;
}

/**
 * Task structure from AI generation.
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
 * Subtask structure.
 */
export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

/**
 * Response from /api/suggestions.
 */
export interface SuggestionsResponse {
    suggestions: string[];
    fromCodebase: boolean;
}

/**
 * Cached suggestions with artifact timestamp for invalidation.
 */
export interface CachedSuggestions {
    suggestions: string[];
    artifactTimestamp: string; // ISO8601 - when artifacts were last modified
}
