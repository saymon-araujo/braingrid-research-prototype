/**
 * TreeView provider for BrainGrid artifacts.
 */
import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { Task, ResearchResults } from '../storage/types';
import {
    BrainGridTreeItem,
    ArtifactsCategoryItem,
    ArtifactTreeItem,
    ArtifactInfo,
    RequirementsCategoryItem,
    TasksCategoryItem,
    TaskTreeItem,
    SubtaskTreeItem,
    ResearchCategoryItem,
    ResearchSessionItem,
    EmptyStateItem
} from './TreeItems';
import { StoredArtifact, ARTIFACT_FILENAMES } from '../storage/types';
import { isDocumentationArtifact } from '../scanner/types';
import * as path from 'path';

/**
 * TreeDataProvider for BrainGrid artifacts.
 * Displays Requirements, Tasks, and Research in a hierarchical view.
 */
export class BrainGridTreeProvider implements vscode.TreeDataProvider<BrainGridTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<BrainGridTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private mdFileWatcher: vscode.FileSystemWatcher | undefined;
    private refreshDebounceTimer: NodeJS.Timeout | undefined;
    private readonly DEBOUNCE_MS = 500;

    // Cached data
    private cachedArtifacts: StoredArtifact[] = [];
    private cachedRequirements: string | null = null;
    private cachedTasks: Task[] = [];
    private cachedResearch: ResearchResults[] = [];
    private isLoading = false;

    constructor(private storageManager: StorageManager | null) {
        this.setupFileWatcher();
    }

    /**
     * Set up file watcher for .braingrid directory.
     */
    private setupFileWatcher(): void {
        if (!this.storageManager) {
            return;
        }

        // Watch for changes in .braingrid/**/*.json and .braingrid/**/*.md
        const jsonPattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders?.[0] || '',
            '.braingrid/**/*.json'
        );
        const mdPattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders?.[0] || '',
            '.braingrid/**/*.md'
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(jsonPattern);
        const mdWatcher = vscode.workspace.createFileSystemWatcher(mdPattern);

        // Debounce refresh calls
        const debouncedRefresh = () => {
            if (this.refreshDebounceTimer) {
                clearTimeout(this.refreshDebounceTimer);
            }
            this.refreshDebounceTimer = setTimeout(() => {
                this.refresh();
            }, this.DEBOUNCE_MS);
        };

        // Watch JSON files
        this.fileWatcher.onDidCreate(debouncedRefresh);
        this.fileWatcher.onDidChange(debouncedRefresh);
        this.fileWatcher.onDidDelete(debouncedRefresh);

        // Watch MD files
        mdWatcher.onDidCreate(debouncedRefresh);
        mdWatcher.onDidChange(debouncedRefresh);
        mdWatcher.onDidDelete(debouncedRefresh);

        // Store md watcher for disposal
        this.mdFileWatcher = mdWatcher;
    }

    /**
     * Refresh the tree view data.
     */
    refresh(): void {
        // Clear cache to force reload
        this.cachedArtifacts = [];
        this.cachedRequirements = null;
        this.cachedTasks = [];
        this.cachedResearch = [];
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Get tree item representation.
     */
    getTreeItem(element: BrainGridTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for a tree element.
     */
    async getChildren(element?: BrainGridTreeItem): Promise<BrainGridTreeItem[]> {
        // No storage available
        if (!this.storageManager) {
            return [new EmptyStateItem('Open a workspace to view artifacts')];
        }

        // Root level - return category nodes
        if (!element) {
            return this.getRootChildren();
        }

        // Category level - return items
        switch (element.itemType) {
            case 'artifacts':
                return this.getArtifactsChildren();
            case 'requirements':
                return this.getRequirementsChildren();
            case 'tasks':
                return this.getTasksChildren();
            case 'task':
                return this.getSubtasksChildren(element as TaskTreeItem);
            case 'research':
                return this.getResearchChildren();
            default:
                return [];
        }
    }

    /**
     * Get root level category nodes.
     */
    private async getRootChildren(): Promise<BrainGridTreeItem[]> {
        if (this.isLoading) {
            return [new EmptyStateItem('Loading...')];
        }

        this.isLoading = true;

        try {
            // Load all data in parallel
            const [artifacts, requirements, tasks, research] = await Promise.all([
                this.storageManager!.listStoredArtifacts(),
                this.storageManager!.loadRequirements(),
                this.storageManager!.loadTasks(),
                this.storageManager!.loadResearch()
            ]);

            // Cache the results
            this.cachedArtifacts = artifacts;
            this.cachedRequirements = requirements;
            this.cachedTasks = tasks;
            this.cachedResearch = research;

            // Check if any data exists
            const hasData = artifacts.length > 0 || requirements || tasks.length > 0 || research.length > 0;

            if (!hasData) {
                // Return empty array to show the viewsWelcome defined in package.json
                return [];
            }

            // Return category nodes - artifacts first since they're from scan
            const nodes: BrainGridTreeItem[] = [];

            if (artifacts.length > 0) {
                nodes.push(new ArtifactsCategoryItem(artifacts.length));
            }

            nodes.push(
                new RequirementsCategoryItem(!!requirements),
                new TasksCategoryItem(tasks.length),
                new ResearchCategoryItem(research.length)
            );

            return nodes;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('BrainGrid TreeView: Failed to load data', message);
            return [new EmptyStateItem('Failed to load artifacts')];
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Get requirements children (placeholder for preview).
     */
    private async getRequirementsChildren(): Promise<BrainGridTreeItem[]> {
        if (!this.cachedRequirements) {
            return [new EmptyStateItem('No requirements document')];
        }

        // For MVP, just show a preview indicator
        // Full content viewing is handled by commands
        const previewLength = Math.min(this.cachedRequirements.length, 100);
        const preview = this.cachedRequirements.substring(0, previewLength);
        const truncated = this.cachedRequirements.length > 100 ? '...' : '';

        const item = new EmptyStateItem(`${preview}${truncated}`);
        item.tooltip = 'Click to view full requirements document';
        return [item];
    }

    /**
     * Get task items.
     */
    private async getTasksChildren(): Promise<BrainGridTreeItem[]> {
        if (this.cachedTasks.length === 0) {
            return [new EmptyStateItem('No tasks')];
        }

        return this.cachedTasks.map(task => new TaskTreeItem(task));
    }

    /**
     * Get subtask items for a task.
     */
    private async getSubtasksChildren(taskItem: TaskTreeItem): Promise<BrainGridTreeItem[]> {
        const task = taskItem.task;
        if (!task.subtasks || task.subtasks.length === 0) {
            return [];
        }

        return task.subtasks.map(subtask => new SubtaskTreeItem(subtask, task.id));
    }

    /**
     * Get research session items.
     */
    private async getResearchChildren(): Promise<BrainGridTreeItem[]> {
        if (this.cachedResearch.length === 0) {
            return [new EmptyStateItem('No research sessions')];
        }

        // Sort by timestamp descending (newest first)
        const sorted = [...this.cachedResearch].sort((a, b) => {
            const dateA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
            const dateB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
            return dateB.getTime() - dateA.getTime();
        });

        return sorted.map(research => new ResearchSessionItem(research));
    }

    /**
     * Get scan artifact items.
     */
    private async getArtifactsChildren(): Promise<BrainGridTreeItem[]> {
        if (this.cachedArtifacts.length === 0) {
            return [new EmptyStateItem('No scan artifacts')];
        }

        // Convert stored artifacts to ArtifactInfo for display
        return this.cachedArtifacts.map(artifact => {
            const filename = ARTIFACT_FILENAMES[artifact.type];
            const filePath = path.join(this.storageManager!.artifactsPath, filename);

            const info: ArtifactInfo = {
                type: artifact.type,
                filename,
                generatedAt: artifact.metadata.generatedAt,
                isDocumentation: isDocumentationArtifact(artifact.type),
                filePath
            };

            return new ArtifactTreeItem(info);
        });
    }

    /**
     * Dispose resources.
     */
    dispose(): void {
        if (this.refreshDebounceTimer) {
            clearTimeout(this.refreshDebounceTimer);
        }
        this.fileWatcher?.dispose();
        this.mdFileWatcher?.dispose();
        this._onDidChangeTreeData.dispose();
    }
}
