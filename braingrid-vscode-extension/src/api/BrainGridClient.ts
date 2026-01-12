/**
 * BrainGridClient - API client for BrainGrid backend communication.
 *
 * Handles communication with the Next.js backend APIs for research and chat.
 */
import * as vscode from 'vscode';
import {
    ResearchResults,
    ResearchRequest,
    ChatRequest,
    ParsedArtifacts,
    Task,
    SuggestionsResponse
} from './types';
import { StorageManager, StoredArtifact, ArtifactType } from '../storage';

/**
 * Configuration for BrainGrid API client.
 */
export interface BrainGridClientConfig {
    baseUrl: string;
    timeout?: number;
}

/**
 * Default configuration - uses localhost Next.js dev server.
 */
const DEFAULT_CONFIG: BrainGridClientConfig = {
    baseUrl: 'http://localhost:3000',
    timeout: 120000 // 2 minutes for research/generation
};

/**
 * Client for BrainGrid backend API communication.
 */
export class BrainGridClient {
    private config: BrainGridClientConfig;
    private outputChannel?: vscode.OutputChannel;

    constructor(config?: Partial<BrainGridClientConfig>, outputChannel?: vscode.OutputChannel) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.outputChannel = outputChannel;
    }

    /**
     * Perform domain research using Perplexity + Claude.
     */
    async research(projectDescription: string): Promise<ResearchResults> {
        this.log(`Starting research for: ${projectDescription.substring(0, 50)}...`);

        const response = await this.fetch('/api/research', {
            method: 'POST',
            body: JSON.stringify({ projectDescription } as ResearchRequest)
        });

        if (!response.ok) {
            const error = await this.parseError(response);
            throw new Error(`Research failed: ${error}`);
        }

        const data = await response.json() as ResearchResults & { timestamp: string | Date };
        this.log(`Research complete: ${data.findings?.length || 0} findings`);
        return {
            ...data,
            timestamp: new Date(data.timestamp)
        };
    }

    /**
     * Stream chat response from Claude.
     * @param request - Chat request with messages, phase, and optional research context
     * @param onChunk - Callback for each text chunk received
     * @param onComplete - Callback when streaming completes with full text
     */
    async chatStream(
        request: ChatRequest,
        onChunk: (text: string) => void,
        onComplete: (fullText: string) => void
    ): Promise<void> {
        this.log(`Starting chat stream, phase: ${request.phase}`);

        const response = await this.fetch('/api/chat', {
            method: 'POST',
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const error = await this.parseError(response);
            throw new Error(`Chat failed: ${error}`);
        }

        if (!response.body) {
            throw new Error('No response body for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                onChunk(chunk);
            }
        } finally {
            reader.releaseLock();
        }

        this.log(`Chat stream complete: ${fullText.length} chars`);
        onComplete(fullText);
    }

    /**
     * Parse AI response for special markers and extract artifacts.
     */
    parseArtifacts(content: string): ParsedArtifacts {
        const result: ParsedArtifacts = {
            readyToGenerate: false
        };

        // Check for ready to generate marker
        if (content.includes('[READY_TO_GENERATE]')) {
            result.readyToGenerate = true;
            this.log('Detected [READY_TO_GENERATE] marker');
        }

        // Extract requirements
        const reqMatch = content.match(/\[REQUIREMENTS_START\]([\s\S]*?)\[REQUIREMENTS_END\]/);
        if (reqMatch) {
            result.requirements = reqMatch[1].trim();
            this.log(`Extracted requirements: ${result.requirements.length} chars`);
        }

        // Extract tasks
        const tasksMatch = content.match(/\[TASKS_START\]([\s\S]*?)\[TASKS_END\]/);
        if (tasksMatch) {
            try {
                result.tasks = JSON.parse(tasksMatch[1].trim()) as Task[];
                this.log(`Extracted ${result.tasks.length} tasks`);
            } catch (e) {
                this.log(`Failed to parse tasks JSON: ${e}`);
            }
        }

        return result;
    }

    /**
     * Format research results as context string for chat.
     */
    formatResearchContext(research: ResearchResults): string {
        const findings = research.findings
            .filter(f => f.relevance === 'high' || f.relevance === 'medium')
            .map(f => `- **${f.title}** (${f.category}): ${f.content}`)
            .join('\n');

        return `## Research Summary\n${research.summary}\n\n## Key Findings\n${findings}`;
    }

    /**
     * Fetch project-specific suggestions using Haiku.
     * @param codebaseContext - Optional codebase context for informed suggestions
     */
    async fetchSuggestions(codebaseContext?: string): Promise<SuggestionsResponse> {
        this.log('Fetching suggestions...');

        const response = await this.fetch('/api/suggestions', {
            method: 'POST',
            body: JSON.stringify({ codebaseContext })
        });

        if (!response.ok) {
            const error = await this.parseError(response);
            throw new Error(`Suggestions failed: ${error}`);
        }

        const data = await response.json() as SuggestionsResponse;
        this.log(`Got ${data.suggestions.length} suggestions (fromCodebase: ${data.fromCodebase})`);
        return data;
    }

    /**
     * Format scan artifacts into context string for chat.
     * Prefers markdown documentation over raw JSON for better readability.
     */
    async formatCodebaseContext(storageManager: StorageManager): Promise<string | undefined> {
        const artifacts = await storageManager.listStoredArtifacts();
        if (artifacts.length === 0) {
            this.log('No scan artifacts found for codebase context');
            return undefined;
        }

        const sections: string[] = [];

        // Prefer documentation artifacts (already formatted markdown)
        // Fallback to JSON summaries if docs not available
        const docTypes: ArtifactType[] = ['summary-docs', 'architecture-docs', 'dataModel-docs', 'workflow-docs'];
        const jsonTypes: ArtifactType[] = ['summary', 'architecture', 'dataModel', 'workflow'];

        for (let i = 0; i < docTypes.length; i++) {
            const docArtifact = artifacts.find(a => a.type === docTypes[i]);
            const jsonArtifact = artifacts.find(a => a.type === jsonTypes[i]);

            if (docArtifact) {
                // Use markdown documentation (already well-formatted)
                sections.push(docArtifact.content);
            } else if (jsonArtifact) {
                // Create brief summary from JSON artifact
                sections.push(this.summarizeJsonArtifact(jsonArtifact));
            }
        }

        if (sections.length === 0) {
            this.log('No usable artifacts found for codebase context');
            return undefined;
        }

        this.log(`Formatted codebase context from ${sections.length} artifacts`);
        return sections.join('\n\n---\n\n');
    }

    /**
     * Create a brief summary from a JSON artifact.
     */
    private summarizeJsonArtifact(artifact: StoredArtifact): string {
        const type = artifact.type;
        try {
            const data = JSON.parse(artifact.content);

            switch (type) {
                case 'summary':
                    return `## Codebase Summary
- **Project**: ${data.projectName || 'Unknown'}
- **Primary Language**: ${data.primaryLanguage || 'Unknown'}
- **Frameworks**: ${Array.isArray(data.frameworks) ? data.frameworks.join(', ') : 'None detected'}
- **Dependencies**: ${data.dependencyCount || 0} packages`;

                case 'architecture':
                    const layers = Array.isArray(data.layers)
                        ? data.layers.map((l: { name?: string }) => l.name || 'Unknown').join(', ')
                        : 'Not analyzed';
                    return `## Architecture
- **Layers**: ${layers}
- **Entry Points**: ${Array.isArray(data.entryPoints) ? data.entryPoints.length : 0}`;

                case 'dataModel':
                    return `## Data Model
- **Types**: ${Array.isArray(data.types) ? data.types.length : 0} type definitions
- **Interfaces**: ${Array.isArray(data.interfaces) ? data.interfaces.length : 0} interfaces`;

                case 'workflow':
                    return `## Workflows
- **Detected Patterns**: ${Array.isArray(data.patterns) ? data.patterns.length : 0}
- **API Routes**: ${Array.isArray(data.routes) ? data.routes.length : 0}`;

                default:
                    return `## ${type}\n(Artifact content available)`;
            }
        } catch {
            return `## ${type}\n(Artifact content available)`;
        }
    }

    /**
     * Perform HTTP fetch with timeout.
     */
    private async fetch(path: string, options: RequestInit): Promise<Response> {
        const url = `${this.config.baseUrl}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Parse error response from API.
     */
    private async parseError(response: Response): Promise<string> {
        try {
            const data = await response.json() as { error?: string; message?: string };
            return data.error || data.message || `HTTP ${response.status}`;
        } catch {
            return `HTTP ${response.status}: ${response.statusText}`;
        }
    }

    /**
     * Log a message to the output channel if available.
     */
    private log(message: string): void {
        if (this.outputChannel) {
            const timestamp = new Date().toISOString();
            this.outputChannel.appendLine(`[${timestamp}] BrainGridClient: ${message}`);
        }
    }
}
