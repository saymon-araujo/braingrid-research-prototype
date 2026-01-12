/**
 * Documentation Generator
 *
 * Transforms raw JSON artifacts into human-readable markdown documentation
 * by calling the AI documentation API endpoint.
 */
import * as path from 'path';
import { ArtifactResult, ArtifactType } from '../types';

/**
 * Configuration for documentation generation
 */
export interface DocumentationOptions {
    /** API endpoint for AI documentation generation */
    apiEndpoint: string;
    /** Project name for context */
    projectName: string;
    /** Timeout in milliseconds (default: 120000 = 2 minutes) */
    timeout?: number;
}

/**
 * Mapping from our artifact types to API artifact types
 */
const ARTIFACT_TYPE_MAPPING: Record<string, string> = {
    'summary': 'codebaseSummary',
    'dataModel': 'dataModel',
    'architecture': 'architecture',
    'workflow': 'workflows'
};

/**
 * Documentation artifact type suffixes
 */
type DocumentationArtifactType = 'summary-docs' | 'dataModel-docs' | 'architecture-docs' | 'workflow-docs';

/**
 * API response from the documentation endpoint
 */
interface DocumentationApiResponse {
    markdown: string;
    artifactType: string;
    generatedAt: string;
}

/**
 * API error response
 */
interface DocumentationApiError {
    error: string;
    details?: string;
}

/**
 * Generates AI-powered markdown documentation from raw JSON artifacts.
 *
 * This generator calls an external API endpoint that uses Claude to transform
 * raw scanner output into human-readable documentation similar to production
 * BrainGrid artifacts.
 */
export class DocumentationGenerator {
    private readonly options: Required<DocumentationOptions>;

    /**
     * Create a new DocumentationGenerator.
     * @param workspacePath - Root path of the workspace (used to derive project name if not provided)
     * @param options - Configuration options
     */
    constructor(workspacePath: string, options?: Partial<DocumentationOptions>) {
        this.options = {
            apiEndpoint: options?.apiEndpoint || 'http://localhost:3000/api/ai-documentation',
            projectName: options?.projectName || path.basename(workspacePath),
            timeout: options?.timeout || 120000 // 2 minutes default
        };
    }

    /**
     * Generate documentation for a single artifact.
     *
     * @param artifactType - The original artifact type (e.g., 'summary', 'dataModel')
     * @param jsonContent - The raw JSON content from the scanner
     * @returns Documentation artifact result
     */
    async generateForArtifact(
        artifactType: string,
        jsonContent: string
    ): Promise<ArtifactResult> {
        const apiArtifactType = ARTIFACT_TYPE_MAPPING[artifactType];

        if (!apiArtifactType) {
            throw new Error(`Unsupported artifact type for documentation: ${artifactType}`);
        }

        console.log(`  [documentation] Generating AI documentation for ${artifactType}...`);
        const startTime = Date.now();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

            const response = await fetch(this.options.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    artifactType: apiArtifactType,
                    jsonContent,
                    projectName: this.options.projectName
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ error: 'Unknown error' })) as DocumentationApiError;
                throw new Error(
                    `API error (${response.status}): ${errorBody.error}${errorBody.details ? ` - ${errorBody.details}` : ''}`
                );
            }

            const result = await response.json() as DocumentationApiResponse;

            const duration = Date.now() - startTime;
            console.log(
                `  [documentation] Generated ${artifactType} documentation in ${(duration / 1000).toFixed(1)}s (${result.markdown.length} chars)`
            );

            return {
                type: `${artifactType}-docs` as ArtifactType,
                content: result.markdown,
                generatedAt: result.generatedAt,
                fileCount: 0,
                errorCount: 0
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Documentation generation timed out after ${this.options.timeout / 1000}s`);
            }
            throw error;
        }
    }

    /**
     * Generate documentation for multiple artifacts.
     *
     * Processes artifacts sequentially to avoid overwhelming the API.
     *
     * @param artifacts - Map of artifact type to JSON content
     * @returns Map of documentation artifact type to result
     */
    async generateAll(
        artifacts: Map<string, string>
    ): Promise<Map<string, ArtifactResult>> {
        const results = new Map<string, ArtifactResult>();
        const totalArtifacts = Object.keys(ARTIFACT_TYPE_MAPPING).filter(
            type => artifacts.has(type)
        ).length;
        let processed = 0;

        console.log(`  [documentation] Starting documentation generation for ${totalArtifacts} artifacts...`);

        for (const [type, jsonContent] of artifacts) {
            const apiType = ARTIFACT_TYPE_MAPPING[type];

            if (!apiType) {
                // Skip artifacts that don't have documentation mapping (e.g., directory)
                continue;
            }

            processed++;
            console.log(`  [documentation] Processing ${type} (${processed}/${totalArtifacts})...`);

            try {
                const result = await this.generateForArtifact(type, jsonContent);
                results.set(`${type}-docs`, result);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`  [documentation] Failed to generate ${type} documentation: ${errorMessage}`);

                // Create error placeholder artifact
                results.set(`${type}-docs`, {
                    type: `${type}-docs` as ArtifactType,
                    content: `# Documentation Generation Failed\n\nError: ${errorMessage}\n\nPlease ensure the AI documentation API is running and try again.`,
                    generatedAt: new Date().toISOString(),
                    fileCount: 0,
                    errorCount: 1,
                    incomplete: true
                });
            }
        }

        console.log(`  [documentation] Documentation generation complete: ${results.size} artifacts`);
        return results;
    }

    /**
     * Check if the documentation API is available.
     *
     * @returns true if API is reachable and responding
     */
    async checkApiAvailability(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for health check

            const response = await fetch(this.options.apiEndpoint, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }
}
