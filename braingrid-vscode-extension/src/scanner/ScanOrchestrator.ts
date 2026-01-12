/**
 * ScanOrchestrator coordinates the scanning of a workspace
 * and generation of contextual artifacts.
 */
import * as vscode from 'vscode';
import {
    ArtifactType,
    ScanOptions,
    ScanResult,
    ScanError,
    ArtifactResult,
    ProgressCallback,
    DEFAULT_SCAN_OPTIONS
} from './types';
import { StorageManager } from '../storage/StorageManager';
import { DirectoryStructureGenerator } from './generators/DirectoryStructureGenerator';
import { CodebaseSummaryGenerator } from './generators/CodebaseSummaryGenerator';
import { DataModelExtractor } from './generators/DataModelExtractor';
import { ArchitectureMapper } from './generators/ArchitectureMapper';
import { WorkflowDetector } from './generators/WorkflowDetector';
import { DocumentationGenerator } from './generators/DocumentationGenerator';
import * as path from 'path';

/**
 * Generator configuration type
 */
interface GeneratorConfig {
    type: ArtifactType;
    Generator: new (path: string, opts?: ScanOptions) => { generate(): Promise<ArtifactResult> };
    message: string;
}

/**
 * Orchestrates workspace scanning and artifact generation.
 */
export class ScanOrchestrator {
    /**
     * Generator execution order with configuration
     */
    private static readonly GENERATOR_ORDER: GeneratorConfig[] = [
        { type: 'directory', Generator: DirectoryStructureGenerator, message: 'Scanning directory structure...' },
        { type: 'summary', Generator: CodebaseSummaryGenerator, message: 'Analyzing codebase...' },
        { type: 'dataModel', Generator: DataModelExtractor, message: 'Extracting data models...' },
        { type: 'architecture', Generator: ArchitectureMapper, message: 'Mapping architecture...' },
        { type: 'workflow', Generator: WorkflowDetector, message: 'Detecting workflows...' }
    ];

    /**
     * Timeout for each generator in milliseconds (15 minutes)
     */
    private static readonly GENERATOR_TIMEOUT = 900000;

    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private progressCallback: ProgressCallback | null = null;
    private cancellationToken: vscode.CancellationToken | null = null;

    /**
     * Create a new ScanOrchestrator.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    }

    /**
     * Get the workspace path being scanned.
     */
    getWorkspacePath(): string {
        return this.workspacePath;
    }

    /**
     * Get the current scan options.
     */
    getOptions(): Required<ScanOptions> {
        return { ...this.options };
    }

    /**
     * Register a progress callback for scan updates.
     * @param callback - Function to receive progress updates
     */
    onProgress(callback: ProgressCallback): void {
        this.progressCallback = callback;
    }

    /**
     * Set cancellation token for aborting scans.
     * @param token - VS Code cancellation token
     */
    setCancellationToken(token: vscode.CancellationToken): void {
        this.cancellationToken = token;
    }

    /**
     * Run full workspace scan, generating all artifacts.
     * Artifacts are generated in dependency order:
     * 1. directory (structure)
     * 2. summary (tech stack)
     * 3. dataModel (schemas)
     * 4. architecture (layers)
     * 5. workflow (operations)
     *
     * @returns Scan result with all generated artifacts
     */
    async scanWorkspace(): Promise<ScanResult> {
        const startTime = Date.now();
        const artifacts: Partial<Record<ArtifactType, ArtifactResult>> = {};
        const errors: ScanError[] = [];

        // Initialize storage
        const storage = new StorageManager(this.workspacePath);
        const initResult = await storage.initWorkspace();
        if (!initResult.success) {
            errors.push({
                stage: 'init',
                message: initResult.error || 'Failed to initialize workspace'
            });
        }

        const totalGenerators = ScanOrchestrator.GENERATOR_ORDER.length;

        for (let i = 0; i < totalGenerators; i++) {
            // Check cancellation before each generator
            if (this.isCancelled()) {
                return {
                    artifacts,
                    duration: Date.now() - startTime,
                    errors,
                    cancelled: true
                };
            }

            const { type, Generator, message } = ScanOrchestrator.GENERATOR_ORDER[i];
            const progress = Math.round((i / totalGenerators) * 100);

            this.reportProgress(type, progress, message);

            try {
                const generator = new Generator(this.workspacePath, this.options);
                const result = await this.withTimeout(generator.generate(), type);

                artifacts[type] = result;

                // Store artifact
                try {
                    await storage.storeArtifact(type, result);
                } catch (storeError) {
                    const storeMessage = storeError instanceof Error ? storeError.message : String(storeError);
                    errors.push({
                        stage: type,
                        message: `Storage failed: ${storeMessage}`
                    });
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({ stage: type, message: errorMessage });

                // Create incomplete artifact placeholder
                artifacts[type] = {
                    type,
                    content: '{}',
                    generatedAt: new Date().toISOString(),
                    fileCount: 0,
                    errorCount: 1,
                    incomplete: true
                };
            }

            const finalProgress = Math.round(((i + 1) / totalGenerators) * 100);
            this.reportProgress(type, finalProgress, `${type} complete`);
        }

        // Optional: Generate AI documentation
        if (this.options.generateDocumentation) {
            await this.generateDocumentation(artifacts, storage, errors);
        }

        return {
            artifacts,
            duration: Date.now() - startTime,
            errors
        };
    }

    /**
     * Generate AI-powered documentation for artifacts.
     * @param artifacts - Generated raw artifacts
     * @param storage - Storage manager for persisting results
     * @param errors - Error array to append any failures
     */
    private async generateDocumentation(
        artifacts: Partial<Record<ArtifactType, ArtifactResult>>,
        storage: StorageManager,
        errors: ScanError[]
    ): Promise<void> {
        // Check cancellation before documentation generation
        if (this.isCancelled()) {
            return;
        }

        this.reportProgress('documentation', 0, 'Generating AI documentation...');

        const docGenerator = new DocumentationGenerator(this.workspacePath, {
            apiEndpoint: this.options.documentationApiEndpoint,
            projectName: path.basename(this.workspacePath)
        });

        // Check if API is available
        const apiAvailable = await docGenerator.checkApiAvailability();
        if (!apiAvailable) {
            console.log('  [documentation] AI documentation API not available, skipping...');
            errors.push({
                stage: 'summary-docs' as ArtifactType,
                message: 'Documentation API not available. Ensure the development server is running.'
            });
            return;
        }

        // Prepare artifacts map
        const artifactsMap = new Map<string, string>();
        for (const [type, result] of Object.entries(artifacts)) {
            if (result && !result.incomplete) {
                artifactsMap.set(type, result.content);
            }
        }

        // Generate documentation
        try {
            const docResults = await docGenerator.generateAll(artifactsMap);

            // Store documentation artifacts
            let docCount = 0;
            for (const [type, result] of docResults) {
                try {
                    // Add to artifacts record
                    artifacts[type as ArtifactType] = result;

                    // Store to disk
                    await storage.storeArtifact(type as ArtifactType, result);
                    docCount++;
                } catch (storeError) {
                    const storeMessage = storeError instanceof Error ? storeError.message : String(storeError);
                    errors.push({
                        stage: type as ArtifactType,
                        message: `Storage failed: ${storeMessage}`
                    });
                }
            }

            this.reportProgress('documentation', 100, `Generated ${docCount} documentation files`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('  [documentation] Error:', errorMessage);
            errors.push({
                stage: 'summary-docs' as ArtifactType,
                message: `Documentation generation failed: ${errorMessage}`
            });
        }
    }

    /**
     * Scan and generate a single artifact type.
     * @param artifactType - Type of artifact to generate
     * @returns Generated artifact result
     */
    async scanArtifact(artifactType: ArtifactType): Promise<ArtifactResult> {
        const config = ScanOrchestrator.GENERATOR_ORDER.find(g => g.type === artifactType);
        if (!config) {
            throw new Error(`Unknown artifact type: ${artifactType}`);
        }

        // Initialize storage
        const storage = new StorageManager(this.workspacePath);
        await storage.initWorkspace();

        this.reportProgress(artifactType, 0, config.message);

        try {
            const generator = new config.Generator(this.workspacePath, this.options);
            const result = await this.withTimeout(generator.generate(), artifactType);

            // Store artifact
            await storage.storeArtifact(artifactType, result);

            this.reportProgress(artifactType, 100, `${artifactType} complete`);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.reportProgress(artifactType, 0, `Error: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Execute a promise with timeout protection.
     * @param promise - The promise to execute
     * @param stage - The artifact type for error messages
     * @returns The promise result
     * @throws Error if timeout is exceeded
     */
    private async withTimeout<T>(promise: Promise<T>, stage: ArtifactType): Promise<T> {
        return Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`${stage} generator timed out after 15 minutes`));
                }, ScanOrchestrator.GENERATOR_TIMEOUT);
            })
        ]);
    }

    /**
     * Report progress to registered callback.
     * @param stage - Current scan stage name
     * @param progress - Progress percentage (0-100)
     * @param message - Optional status message
     */
    protected reportProgress(stage: string, progress: number, message?: string): void {
        if (this.progressCallback) {
            this.progressCallback(stage, progress, message);
        }
    }

    /**
     * Check if scan has been cancelled.
     * @returns true if cancellation was requested
     */
    protected isCancelled(): boolean {
        return this.cancellationToken?.isCancellationRequested ?? false;
    }
}
