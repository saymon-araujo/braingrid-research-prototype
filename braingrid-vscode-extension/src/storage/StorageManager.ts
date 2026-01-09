import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { InitResult, Task, Subtask, ResearchResults, ResearchSession, ResearchFinding, MAX_RESEARCH_SESSIONS, ScanMetadata, StoredArtifact, ArtifactMetadata, ARTIFACT_FILENAMES } from './types';
import { ArtifactType, ArtifactResult } from '../scanner/types';

/**
 * StorageManager handles workspace folder structure creation and provides
 * the core interface for all file-based storage operations.
 */
export class StorageManager {
    private readonly workspaceRoot: string;
    public readonly braingridPath: string;

    public readonly artifactsPath: string;
    public readonly cachePath: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.braingridPath = path.join(workspaceRoot, '.braingrid');
        this.artifactsPath = path.join(this.braingridPath, 'artifacts');
        this.cachePath = path.join(this.braingridPath, 'cache');
    }

    /**
     * Initialize the workspace folder structure.
     * Creates .braingrid/, artifacts/, and cache/ folders if they don't exist.
     */
    async initWorkspace(): Promise<InitResult> {
        const foldersCreated: string[] = [];

        try {
            // Check if workspace root exists and is writable
            await fs.promises.access(this.workspaceRoot, fs.constants.W_OK);
        } catch {
            // Check if read-only
            try {
                await fs.promises.access(this.workspaceRoot, fs.constants.R_OK);
                return {
                    success: false,
                    error: 'Workspace is read-only. BrainGrid will operate in memory-only mode'
                };
            } catch {
                return {
                    success: false,
                    error: 'Workspace root does not exist or is not accessible'
                };
            }
        }

        try {
            // Create .braingrid folder
            if (!await this.folderExists(this.braingridPath)) {
                await fs.promises.mkdir(this.braingridPath, { recursive: true });
                foldersCreated.push(this.braingridPath);
            }

            // Create artifacts folder
            if (!await this.folderExists(this.artifactsPath)) {
                await fs.promises.mkdir(this.artifactsPath, { recursive: true });
                foldersCreated.push(this.artifactsPath);
            }

            // Create cache folder
            if (!await this.folderExists(this.cachePath)) {
                await fs.promises.mkdir(this.cachePath, { recursive: true });
                foldersCreated.push(this.cachePath);
            }

            return { success: true, foldersCreated };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('EACCES') || message.includes('permission')) {
                return {
                    success: false,
                    error: 'Cannot create .braingrid/ folder. Check permissions'
                };
            }
            return {
                success: false,
                error: `Failed to initialize workspace: ${message}`
            };
        }
    }

    /**
     * Validate that the required folder structure exists.
     * Returns true if .braingrid/, artifacts/, and cache/ all exist.
     */
    async validateStructure(): Promise<boolean> {
        const folders = [this.braingridPath, this.artifactsPath, this.cachePath];
        for (const folder of folders) {
            if (!await this.folderExists(folder)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Save an artifact file to the artifacts folder.
     * @param filename - The artifact filename (e.g., 'codebase-summary.md')
     * @param content - The markdown content to save
     */
    async saveArtifact(filename: string, content: string): Promise<void> {
        const filePath = path.join(this.artifactsPath, filename);

        try {
            await fs.promises.writeFile(filePath, content, 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error(`Cannot save ${filename}. Disk full`);
            }
            if (err.code === 'EACCES') {
                throw new Error(`Cannot save ${filename}. Permission denied`);
            }
            throw new Error(`Failed to save ${filename}: ${err.message}`);
        }
    }

    /**
     * Load an artifact file from the artifacts folder.
     * @param filename - The artifact filename to load
     * @returns The file content, or null if the file doesn't exist
     */
    async loadArtifact(filename: string): Promise<string | null> {
        const filePath = path.join(this.artifactsPath, filename);

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return null;
            }
            if (err.code === 'EACCES') {
                throw new Error(`Cannot read ${filename}. Permission denied`);
            }
            throw new Error(`Failed to read ${filename}: ${err.message}`);
        }
    }

    /**
     * Get the last modified timestamp of an artifact file.
     * @param filename - The artifact filename
     * @returns The last modified date, or null if the file doesn't exist
     */
    async getArtifactTimestamp(filename: string): Promise<Date | null> {
        const filePath = path.join(this.artifactsPath, filename);

        try {
            const stats = await fs.promises.stat(filePath);
            return stats.mtime;
        } catch {
            return null;
        }
    }

    /**
     * List all artifact files in the artifacts folder.
     * @returns Array of markdown filenames
     */
    async listArtifacts(): Promise<string[]> {
        try {
            const files = await fs.promises.readdir(this.artifactsPath);
            return files.filter(file => file.endsWith('.md'));
        } catch {
            return [];
        }
    }

    // ==================== Artifact Storage with Metadata ====================

    /**
     * Store an artifact with full metadata, atomic writes, and versioning.
     * @param type - The artifact type
     * @param result - The ArtifactResult from a generator
     */
    async storeArtifact(type: ArtifactType, result: ArtifactResult): Promise<void> {
        const filePath = this.getArtifactPath(type);
        const tmpPath = `${filePath}.tmp`;
        const previousPath = this.getPreviousArtifactPath(type);

        // Load existing for versioning
        const existing = await this.getStoredArtifact(type);
        const version = existing ? existing.metadata.version + 1 : 1;

        const artifact: StoredArtifact = {
            id: crypto.randomUUID(),
            type,
            workspacePath: this.workspaceRoot,
            content: result.content,
            metadata: {
                generatedAt: result.generatedAt,
                fileCount: result.fileCount,
                errorCount: result.errorCount,
                version,
                incomplete: result.incomplete
            }
        };

        // Validate before saving
        if (!this.validateStoredArtifact(artifact)) {
            throw new Error(`Invalid artifact structure for type: ${type}`);
        }

        try {
            // Backup existing to .previous.json
            if (existing) {
                try {
                    await fs.promises.writeFile(previousPath, JSON.stringify(existing, null, 2), 'utf-8');
                } catch (backupError) {
                    console.warn(`Failed to create artifact backup for ${type}:`, backupError);
                }
            }

            // Write to temp file first
            await fs.promises.writeFile(tmpPath, JSON.stringify(artifact, null, 2), 'utf-8');

            // Atomically rename temp to target
            await fs.promises.rename(tmpPath, filePath);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.promises.unlink(tmpPath);
            } catch {
                // Ignore cleanup errors
            }

            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error(`Cannot store ${type} artifact. Disk full`);
            }
            if (err.code === 'EACCES') {
                throw new Error(`Cannot store ${type} artifact. Permission denied`);
            }
            throw new Error(`Failed to store ${type} artifact: ${err.message}`);
        }
    }

    /**
     * Get a stored artifact with its metadata.
     * @param type - The artifact type to retrieve
     * @returns The stored artifact, or null if not found
     */
    async getStoredArtifact(type: ArtifactType): Promise<StoredArtifact | null> {
        const filePath = this.getArtifactPath(type);

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = JSON.parse(content);

            if (!this.validateStoredArtifact(data)) {
                console.warn(`Invalid stored artifact structure for ${type}`);
                return null;
            }

            return data;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return null;
            }
            if (err.code === 'EACCES') {
                throw new Error(`Cannot read ${type} artifact. Permission denied`);
            }
            if (error instanceof SyntaxError) {
                console.error(`Corrupted ${type} artifact JSON detected`);
                return null;
            }
            console.warn(`Failed to load ${type} artifact: ${err.message}`);
            return null;
        }
    }

    /**
     * List all stored artifacts with metadata.
     * @returns Array of stored artifacts
     */
    async listStoredArtifacts(): Promise<StoredArtifact[]> {
        const artifacts: StoredArtifact[] = [];

        for (const type of Object.keys(ARTIFACT_FILENAMES) as ArtifactType[]) {
            const artifact = await this.getStoredArtifact(type);
            if (artifact) {
                artifacts.push(artifact);
            }
        }

        return artifacts;
    }

    /**
     * Delete an artifact and its previous version.
     * @param type - The artifact type to delete
     */
    async deleteArtifact(type: ArtifactType): Promise<void> {
        const filePath = this.getArtifactPath(type);
        const previousPath = this.getPreviousArtifactPath(type);

        // Delete main artifact
        try {
            await fs.promises.unlink(filePath);
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
                if (err.code === 'EACCES') {
                    throw new Error(`Cannot delete ${type} artifact. Permission denied`);
                }
                throw new Error(`Failed to delete ${type} artifact: ${err.message}`);
            }
        }

        // Delete previous version
        try {
            await fs.promises.unlink(previousPath);
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
                console.warn(`Failed to delete ${type} previous artifact: ${err.message}`);
            }
        }
    }

    /**
     * Restore a previous version of an artifact.
     * @param type - The artifact type to restore
     * @returns true if restored, false if no previous version
     */
    async restoreArtifact(type: ArtifactType): Promise<boolean> {
        const filePath = this.getArtifactPath(type);
        const previousPath = this.getPreviousArtifactPath(type);

        try {
            // Check if previous version exists
            await fs.promises.access(previousPath, fs.constants.R_OK);

            // Read previous version
            const content = await fs.promises.readFile(previousPath, 'utf-8');
            const previousArtifact = JSON.parse(content);

            // Validate previous artifact
            if (!this.validateStoredArtifact(previousArtifact)) {
                console.warn(`Invalid previous artifact structure for ${type}`);
                return false;
            }

            // Write to temp file first
            const tmpPath = `${filePath}.tmp`;
            await fs.promises.writeFile(tmpPath, content, 'utf-8');

            // Atomically rename temp to target
            await fs.promises.rename(tmpPath, filePath);

            // Delete previous version after successful restore
            try {
                await fs.promises.unlink(previousPath);
            } catch {
                // Ignore cleanup errors
            }

            return true;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return false; // No previous version
            }
            if (error instanceof SyntaxError) {
                console.error(`Corrupted previous ${type} artifact JSON`);
                return false;
            }
            console.warn(`Failed to restore ${type} artifact: ${err.message}`);
            return false;
        }
    }

    /**
     * Check if an artifact exists.
     * @param type - The artifact type to check
     * @returns true if artifact exists, false otherwise
     */
    async hasStoredArtifact(type: ArtifactType): Promise<boolean> {
        const filePath = this.getArtifactPath(type);
        return this.fileExists(filePath);
    }

    /**
     * Check if a previous version of an artifact exists.
     * @param type - The artifact type to check
     * @returns true if previous version exists, false otherwise
     */
    async hasPreviousArtifact(type: ArtifactType): Promise<boolean> {
        const previousPath = this.getPreviousArtifactPath(type);
        return this.fileExists(previousPath);
    }

    /**
     * Get the file path for a stored artifact.
     */
    private getArtifactPath(type: ArtifactType): string {
        const filename = ARTIFACT_FILENAMES[type];
        return path.join(this.artifactsPath, filename);
    }

    /**
     * Get the file path for a previous version of an artifact.
     */
    private getPreviousArtifactPath(type: ArtifactType): string {
        const filename = ARTIFACT_FILENAMES[type];
        const baseName = filename.replace('.json', '');
        return path.join(this.artifactsPath, `${baseName}.previous.json`);
    }

    /**
     * Validate a stored artifact has the required structure.
     */
    private validateStoredArtifact(artifact: unknown): artifact is StoredArtifact {
        if (typeof artifact !== 'object' || artifact === null) {
            return false;
        }

        const a = artifact as Record<string, unknown>;

        // Required string fields
        if (typeof a.id !== 'string' || typeof a.type !== 'string' ||
            typeof a.workspacePath !== 'string' || typeof a.content !== 'string') {
            return false;
        }

        // Validate artifact type
        const validTypes: ArtifactType[] = ['directory', 'summary', 'dataModel', 'architecture', 'workflow'];
        if (!validTypes.includes(a.type as ArtifactType)) {
            return false;
        }

        // Required metadata object
        if (typeof a.metadata !== 'object' || a.metadata === null) {
            return false;
        }

        const m = a.metadata as Record<string, unknown>;

        // Validate metadata fields
        if (typeof m.generatedAt !== 'string' ||
            typeof m.fileCount !== 'number' ||
            typeof m.errorCount !== 'number' ||
            typeof m.version !== 'number') {
            return false;
        }

        // Validate generatedAt is valid ISO8601
        const date = new Date(m.generatedAt);
        if (isNaN(date.getTime())) {
            return false;
        }

        // Validate numbers are non-negative integers
        if (!Number.isInteger(m.fileCount) || m.fileCount < 0 ||
            !Number.isInteger(m.errorCount) || m.errorCount < 0 ||
            !Number.isInteger(m.version) || m.version < 1) {
            return false;
        }

        // incomplete is optional but must be boolean if present
        if (m.incomplete !== undefined && typeof m.incomplete !== 'boolean') {
            return false;
        }

        return true;
    }

    // ==================== Requirements Persistence ====================

    /**
     * Save requirements markdown string with atomic writes.
     * Creates backup of existing file before overwriting.
     * @param requirements - The requirements markdown string
     */
    async saveRequirements(requirements: string): Promise<void> {
        const requirementsPath = path.join(this.braingridPath, 'requirements.json');
        const tmpPath = `${requirementsPath}.tmp`;
        const bakPath = `${requirementsPath}.bak`;

        const data = {
            requirements,
            updatedAt: new Date().toISOString()
        };

        try {
            // Create backup of existing file if it exists
            if (await this.fileExists(requirementsPath)) {
                try {
                    await fs.promises.copyFile(requirementsPath, bakPath);
                } catch (backupError) {
                    // Log warning but continue - backup is optional
                    console.warn('Failed to create requirements backup:', backupError);
                }
            }

            // Write to temp file first
            await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

            // Atomically rename temp to target
            await fs.promises.rename(tmpPath, requirementsPath);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.promises.unlink(tmpPath);
            } catch {
                // Ignore cleanup errors
            }

            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error('Cannot save requirements. Disk full');
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot save requirements. Permission denied');
            }
            throw new Error(`Failed to save requirements: ${err.message}`);
        }
    }

    /**
     * Load requirements markdown string from storage.
     * @returns The requirements markdown string, or null if not found
     */
    async loadRequirements(): Promise<string | null> {
        const requirementsPath = path.join(this.braingridPath, 'requirements.json');

        try {
            const content = await fs.promises.readFile(requirementsPath, 'utf-8');
            const data = JSON.parse(content);

            if (typeof data.requirements !== 'string') {
                console.warn('Invalid requirements.json structure: missing requirements field');
                return null;
            }

            return data.requirements;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return null;
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot read requirements. Permission denied');
            }
            if (error instanceof SyntaxError) {
                console.error('Corrupted requirements.json detected');
                return null;
            }
            console.warn(`Failed to load requirements: ${err.message}`);
            return null;
        }
    }

    /**
     * Check if requirements file exists.
     * @returns true if requirements.json exists, false otherwise
     */
    async hasRequirements(): Promise<boolean> {
        const requirementsPath = path.join(this.braingridPath, 'requirements.json');
        return this.fileExists(requirementsPath);
    }

    /**
     * Get the timestamp when requirements were last updated.
     * @returns The last updated date, or null if not found
     */
    async getRequirementsTimestamp(): Promise<Date | null> {
        const requirementsPath = path.join(this.braingridPath, 'requirements.json');

        try {
            const content = await fs.promises.readFile(requirementsPath, 'utf-8');
            const data = JSON.parse(content);

            if (typeof data.updatedAt === 'string') {
                const date = new Date(data.updatedAt);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    // ==================== Tasks Persistence ====================

    /**
     * Save tasks array with atomic writes.
     * Creates backup of existing file before overwriting.
     * @param tasks - The tasks array to save
     */
    async saveTasks(tasks: Task[]): Promise<void> {
        const tasksPath = path.join(this.braingridPath, 'tasks.json');
        const tmpPath = `${tasksPath}.tmp`;
        const bakPath = `${tasksPath}.bak`;

        const data = {
            tasks,
            updatedAt: new Date().toISOString()
        };

        try {
            // Create backup of existing file if it exists
            if (await this.fileExists(tasksPath)) {
                try {
                    await fs.promises.copyFile(tasksPath, bakPath);
                } catch (backupError) {
                    console.warn('Failed to create tasks backup:', backupError);
                }
            }

            // Write to temp file first
            await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

            // Atomically rename temp to target
            await fs.promises.rename(tmpPath, tasksPath);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.promises.unlink(tmpPath);
            } catch {
                // Ignore cleanup errors
            }

            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error('Cannot save tasks. Disk full');
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot save tasks. Permission denied');
            }
            throw new Error(`Failed to save tasks: ${err.message}`);
        }
    }

    /**
     * Load tasks array from storage.
     * Invalid tasks are filtered out, valid tasks are returned.
     * @returns The tasks array, or empty array if not found
     */
    async loadTasks(): Promise<Task[]> {
        const tasksPath = path.join(this.braingridPath, 'tasks.json');

        try {
            const content = await fs.promises.readFile(tasksPath, 'utf-8');
            const data = JSON.parse(content);

            if (!Array.isArray(data.tasks)) {
                console.warn('Invalid tasks.json structure: missing tasks array');
                return [];
            }

            // Filter and validate tasks
            const validTasks: Task[] = [];
            for (const task of data.tasks) {
                if (this.validateTask(task)) {
                    validTasks.push(task);
                } else {
                    console.warn(`Invalid task structure detected, skipping task: ${task?.id ?? 'unknown'}`);
                }
            }

            return validTasks;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return [];
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot read tasks. Permission denied');
            }
            if (error instanceof SyntaxError) {
                console.error('Corrupted tasks.json detected');
                return [];
            }
            console.warn(`Failed to load tasks: ${err.message}`);
            return [];
        }
    }

    /**
     * Get the timestamp when tasks were last updated.
     * @returns The last updated date, or null if not found
     */
    async getTasksTimestamp(): Promise<Date | null> {
        const tasksPath = path.join(this.braingridPath, 'tasks.json');

        try {
            const content = await fs.promises.readFile(tasksPath, 'utf-8');
            const data = JSON.parse(content);

            if (typeof data.updatedAt === 'string') {
                const date = new Date(data.updatedAt);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Validate a task object has the required structure.
     */
    private validateTask(task: unknown): task is Task {
        if (typeof task !== 'object' || task === null) {
            return false;
        }

        const t = task as Record<string, unknown>;

        // Required string fields
        if (typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.description !== 'string') {
            return false;
        }

        // Required boolean field
        if (typeof t.completed !== 'boolean') {
            return false;
        }

        // Required array fields
        if (!Array.isArray(t.subtasks) || !Array.isArray(t.acceptanceCriteria)) {
            return false;
        }

        // Validate subtasks structure
        for (const subtask of t.subtasks) {
            if (!this.validateSubtask(subtask)) {
                return false;
            }
        }

        // Validate acceptance criteria are strings
        for (const criterion of t.acceptanceCriteria) {
            if (typeof criterion !== 'string') {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate a subtask object has the required structure.
     */
    private validateSubtask(subtask: unknown): subtask is Subtask {
        if (typeof subtask !== 'object' || subtask === null) {
            return false;
        }

        const s = subtask as Record<string, unknown>;

        return (
            typeof s.id === 'string' &&
            typeof s.title === 'string' &&
            typeof s.completed === 'boolean'
        );
    }

    // ==================== Research Persistence ====================

    /**
     * Save a research session, appending to existing sessions.
     * Automatically prunes to maintain MAX_RESEARCH_SESSIONS limit.
     * @param research - The research results to save
     */
    async saveResearch(research: ResearchResults): Promise<void> {
        const researchPath = path.join(this.braingridPath, 'research.json');
        const tmpPath = `${researchPath}.tmp`;

        // Create session with ID and string timestamp
        const session: ResearchSession = {
            id: crypto.randomUUID(),
            query: research.query,
            findings: research.findings,
            summary: research.summary,
            suggestedQuestions: research.suggestedQuestions,
            timestamp: research.timestamp.toISOString()
        };

        try {
            // Load existing sessions
            const existingSessions = await this.loadResearchSessions();

            // Append new session
            existingSessions.push(session);

            // Prune if over limit (remove oldest)
            while (existingSessions.length > MAX_RESEARCH_SESSIONS) {
                existingSessions.shift();
            }

            // Save with atomic write
            const data = {
                sessions: existingSessions,
                updatedAt: new Date().toISOString()
            };

            await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
            await fs.promises.rename(tmpPath, researchPath);
        } catch (error) {
            // Clean up temp file if it exists
            try {
                await fs.promises.unlink(tmpPath);
            } catch {
                // Ignore cleanup errors
            }

            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error('Cannot save research. Disk full');
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot save research. Permission denied');
            }
            throw new Error(`Failed to save research: ${err.message}`);
        }
    }

    /**
     * Load all research sessions, converting timestamps to Date objects.
     * @returns Array of research results with Date timestamps
     */
    async loadResearch(): Promise<ResearchResults[]> {
        const sessions = await this.loadResearchSessions();

        return sessions
            .filter(session => this.validateResearchSession(session))
            .map(session => ({
                query: session.query,
                findings: session.findings,
                summary: session.summary,
                suggestedQuestions: session.suggestedQuestions,
                timestamp: new Date(session.timestamp)
            }));
    }

    /**
     * Get the most recent research session.
     * @returns The latest research results, or null if none exist
     */
    async getLatestResearch(): Promise<ResearchResults | null> {
        const results = await this.loadResearch();
        if (results.length === 0) {
            return null;
        }
        return results[results.length - 1];
    }

    /**
     * Get the number of stored research sessions.
     * @returns The count of research sessions
     */
    async getResearchCount(): Promise<number> {
        const sessions = await this.loadResearchSessions();
        return sessions.length;
    }

    /**
     * Load raw research sessions from storage.
     */
    private async loadResearchSessions(): Promise<ResearchSession[]> {
        const researchPath = path.join(this.braingridPath, 'research.json');

        try {
            const content = await fs.promises.readFile(researchPath, 'utf-8');
            const data = JSON.parse(content);

            if (!Array.isArray(data.sessions)) {
                console.warn('Invalid research.json structure: missing sessions array');
                return [];
            }

            return data.sessions;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return [];
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot read research. Permission denied');
            }
            if (error instanceof SyntaxError) {
                console.error('Corrupted research.json detected');
                return [];
            }
            console.warn(`Failed to load research: ${err.message}`);
            return [];
        }
    }

    /**
     * Validate a research session has the required structure.
     */
    private validateResearchSession(session: unknown): session is ResearchSession {
        if (typeof session !== 'object' || session === null) {
            return false;
        }

        const s = session as Record<string, unknown>;

        // Required string fields
        if (typeof s.id !== 'string' || typeof s.query !== 'string' ||
            typeof s.summary !== 'string' || typeof s.timestamp !== 'string') {
            return false;
        }

        // Validate timestamp is valid ISO8601
        const date = new Date(s.timestamp);
        if (isNaN(date.getTime())) {
            return false;
        }

        // Required array fields
        if (!Array.isArray(s.findings) || !Array.isArray(s.suggestedQuestions)) {
            return false;
        }

        // Validate suggestedQuestions are strings
        for (const question of s.suggestedQuestions) {
            if (typeof question !== 'string') {
                return false;
            }
        }

        // Validate findings structure
        for (const finding of s.findings) {
            if (!this.validateResearchFinding(finding)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate a research finding has the required structure.
     */
    private validateResearchFinding(finding: unknown): finding is ResearchFinding {
        if (typeof finding !== 'object' || finding === null) {
            return false;
        }

        const f = finding as Record<string, unknown>;

        // Required string fields
        if (typeof f.id !== 'string' || typeof f.title !== 'string' ||
            typeof f.content !== 'string' || typeof f.category !== 'string' ||
            typeof f.relevance !== 'string') {
            return false;
        }

        // Validate category enum
        const validCategories = ['concept', 'best_practice', 'pitfall', 'edge_case', 'technical'];
        if (!validCategories.includes(f.category)) {
            return false;
        }

        // Validate relevance enum
        const validRelevance = ['high', 'medium', 'low'];
        if (!validRelevance.includes(f.relevance)) {
            return false;
        }

        // source is optional
        if (f.source !== undefined && typeof f.source !== 'string') {
            return false;
        }

        return true;
    }

    // ==================== Scan Metadata Caching ====================

    /**
     * Compute SHA-256 hash of a file's content.
     * @param filePath - Absolute path to the file
     * @returns The SHA-256 hash as a hex string
     */
    async computeFileHash(filePath: string): Promise<string> {
        try {
            const content = await fs.promises.readFile(filePath);
            const hash = crypto.createHash('sha256');
            hash.update(content);
            return hash.digest('hex');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            if (err.code === 'EACCES') {
                throw new Error(`Cannot read file. Permission denied: ${filePath}`);
            }
            throw new Error(`Failed to hash file: ${err.message}`);
        }
    }

    /**
     * Save scan metadata to cache file.
     * @param metadata - The scan metadata to save
     */
    async saveScanMetadata(metadata: ScanMetadata): Promise<void> {
        const cachePath = path.join(this.cachePath, 'last-scan.json');

        try {
            await fs.promises.writeFile(cachePath, JSON.stringify(metadata, null, 2), 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                console.warn('Cannot save scan metadata. Disk full');
                return;
            }
            if (err.code === 'EACCES') {
                console.warn('Cannot save scan metadata. Permission denied');
                return;
            }
            console.error(`Failed to save scan metadata: ${err.message}`);
        }
    }

    /**
     * Load scan metadata from cache file.
     * @returns The scan metadata, or null if not found or invalid
     */
    async loadScanMetadata(): Promise<ScanMetadata | null> {
        const cachePath = path.join(this.cachePath, 'last-scan.json');

        try {
            const content = await fs.promises.readFile(cachePath, 'utf-8');
            const data = JSON.parse(content);

            if (!this.validateScanMetadata(data)) {
                console.warn('Invalid last-scan.json structure');
                return null;
            }

            return data;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                return null;
            }
            if (err.code === 'EACCES') {
                console.warn('Cannot read scan metadata. Permission denied');
                return null;
            }
            if (error instanceof SyntaxError) {
                console.warn('Corrupted last-scan.json detected');
                return null;
            }
            console.warn(`Failed to load scan metadata: ${err.message}`);
            return null;
        }
    }

    /**
     * Clear the scan cache file.
     */
    async clearScanCache(): Promise<void> {
        const cachePath = path.join(this.cachePath, 'last-scan.json');

        try {
            await fs.promises.unlink(cachePath);
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                // File doesn't exist, nothing to clear
                return;
            }
            if (err.code === 'EACCES') {
                console.warn('Cannot clear scan cache. Permission denied');
                return;
            }
            console.warn(`Failed to clear scan cache: ${err.message}`);
        }
    }

    /**
     * Check if file hashes have changed compared to cached metadata.
     * @param oldMetadata - The cached scan metadata
     * @param newFileHashes - Map of relative file paths to current SHA-256 hashes
     * @returns true if changes detected, false otherwise
     */
    hasChanges(oldMetadata: ScanMetadata, newFileHashes: Record<string, string>): boolean {
        const oldPaths = Object.keys(oldMetadata.fileHashes);
        const newPaths = Object.keys(newFileHashes);

        // Check if file count changed
        if (oldPaths.length !== newPaths.length) {
            return true;
        }

        // Check if file paths match
        const oldPathSet = new Set(oldPaths);
        for (const newPath of newPaths) {
            if (!oldPathSet.has(newPath)) {
                return true;
            }
        }

        // Check if any hash changed
        for (const filePath of newPaths) {
            if (oldMetadata.fileHashes[filePath] !== newFileHashes[filePath]) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate scan metadata structure.
     */
    private validateScanMetadata(data: unknown): data is ScanMetadata {
        if (typeof data !== 'object' || data === null) {
            return false;
        }

        const m = data as Record<string, unknown>;

        // Required string timestamp
        if (typeof m.timestamp !== 'string') {
            return false;
        }

        // Validate timestamp is valid ISO8601
        const date = new Date(m.timestamp);
        if (isNaN(date.getTime())) {
            return false;
        }

        // Required number fileCount
        if (typeof m.fileCount !== 'number' || !Number.isInteger(m.fileCount) || m.fileCount < 0) {
            return false;
        }

        // Required object fileHashes
        if (typeof m.fileHashes !== 'object' || m.fileHashes === null || Array.isArray(m.fileHashes)) {
            return false;
        }

        // Validate all hash values are strings
        const hashes = m.fileHashes as Record<string, unknown>;
        for (const key in hashes) {
            if (typeof hashes[key] !== 'string') {
                return false;
            }
        }

        return true;
    }

    // ==================== Private Helpers ====================

    /**
     * Check if a file exists at the given path.
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(filePath);
            return stat.isFile();
        } catch {
            return false;
        }
    }

    /**
     * Check if a folder exists at the given path.
     */
    private async folderExists(folderPath: string): Promise<boolean> {
        try {
            const stat = await fs.promises.stat(folderPath);
            return stat.isDirectory();
        } catch {
            return false;
        }
    }
}
