/**
 * Configuration for the StorageManager
 */
export interface StorageConfig {
    workspaceRoot: string;
}

/**
 * Result of workspace initialization
 */
export interface InitResult {
    success: boolean;
    error?: string;
    foldersCreated?: string[];
}

/**
 * Scan options for file patterns
 */
export interface ScanOptions {
    includePatterns: string[];
    excludePatterns: string[];
}

/**
 * Extension configuration (non-sensitive settings stored in config.json)
 */
export interface Config {
    apiEndpoint: string;
    autoSync: boolean;
    scanOptions: ScanOptions;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
    apiEndpoint: 'https://api.anthropic.com',
    autoSync: true,
    scanOptions: {
        includePatterns: ['**/*'],
        excludePatterns: ['node_modules', '.git', 'dist', 'build', 'out', '.braingrid']
    }
};

/**
 * Subtask within a task
 */
export interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

/**
 * Task with subtasks and acceptance criteria
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
 * Category of a research finding
 */
export type ResearchFindingCategory = 'concept' | 'best_practice' | 'pitfall' | 'edge_case' | 'technical';

/**
 * Relevance level of a research finding
 */
export type ResearchRelevance = 'high' | 'medium' | 'low';

/**
 * Individual research finding
 */
export interface ResearchFinding {
    id: string;
    category: ResearchFindingCategory;
    title: string;
    content: string;
    source?: string;
    relevance: ResearchRelevance;
}

/**
 * Research results with findings and summary (runtime type with Date)
 */
export interface ResearchResults {
    query: string;
    findings: ResearchFinding[];
    summary: string;
    suggestedQuestions: string[];
    timestamp: Date;
}

/**
 * Research session stored in JSON (with string timestamp and ID)
 */
export interface ResearchSession {
    id: string;
    query: string;
    findings: ResearchFinding[];
    summary: string;
    suggestedQuestions: string[];
    timestamp: string; // ISO8601 string for JSON storage
}

/**
 * Maximum number of research sessions to keep
 */
export const MAX_RESEARCH_SESSIONS = 50;

/**
 * Scan metadata for change detection caching
 */
export interface ScanMetadata {
    timestamp: string; // ISO8601 string when scan completed
    fileHashes: Record<string, string>; // Map of relative file paths to SHA-256 hashes
    fileCount: number; // Total files scanned
}
