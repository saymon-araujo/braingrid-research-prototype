/**
 * Tree item classes for BrainGrid TreeView.
 */
import * as vscode from 'vscode';
import { Task, Subtask, ResearchResults } from '../storage/types';

/**
 * Item types for tree nodes.
 */
export type TreeItemType =
    | 'artifacts'
    | 'artifact'
    | 'requirements'
    | 'tasks'
    | 'task'
    | 'subtask'
    | 'research'
    | 'researchSession'
    | 'empty';

/**
 * Base tree item with type information.
 */
export class BrainGridTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly itemType: TreeItemType
    ) {
        super(label, collapsibleState);
    }
}

/**
 * Requirements category item (top-level node).
 */
export class RequirementsCategoryItem extends BrainGridTreeItem {
    constructor(hasRequirements: boolean) {
        super(
            'Requirements',
            hasRequirements
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'requirements'
        );
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = hasRequirements ? '' : 'No requirements';
        this.tooltip = 'Generated requirements document';
    }
}

/**
 * Tasks category item (top-level node).
 */
export class TasksCategoryItem extends BrainGridTreeItem {
    constructor(taskCount: number) {
        super(
            taskCount > 0 ? `Tasks (${taskCount})` : 'Tasks',
            taskCount > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
            'tasks'
        );
        this.iconPath = new vscode.ThemeIcon('checklist');
        this.description = taskCount === 0 ? 'No tasks' : '';
        this.tooltip = `${taskCount} task${taskCount !== 1 ? 's' : ''}`;
    }
}

/**
 * Individual task item.
 */
export class TaskTreeItem extends BrainGridTreeItem {
    public readonly task: Task;

    constructor(task: Task) {
        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
        super(
            task.title,
            hasSubtasks
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'task'
        );
        this.task = task;

        // Set icon based on completion status
        this.iconPath = new vscode.ThemeIcon(
            task.completed ? 'check' : 'circle-outline'
        );

        // Show subtask progress in description
        if (hasSubtasks) {
            const completedSubtasks = task.subtasks.filter(s => s.completed).length;
            this.description = `${completedSubtasks}/${task.subtasks.length}`;
        }

        this.tooltip = this.buildTooltip(task);
        this.contextValue = 'task';

        // Click command to toggle completion
        this.command = {
            command: 'braingrid.toggleTask',
            title: 'Toggle Task Completion',
            arguments: [task.id, null]
        };
    }

    private buildTooltip(task: Task): string {
        const lines = [task.title];
        if (task.description) {
            lines.push('', task.description);
        }
        if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
            lines.push('', 'Acceptance Criteria:');
            task.acceptanceCriteria.forEach(c => lines.push(`  - ${c}`));
        }
        return lines.join('\n');
    }
}

/**
 * Subtask item under a task.
 */
export class SubtaskTreeItem extends BrainGridTreeItem {
    public readonly subtask: Subtask;
    public readonly parentTaskId: string;

    constructor(subtask: Subtask, parentTaskId: string) {
        super(
            subtask.title,
            vscode.TreeItemCollapsibleState.None,
            'subtask'
        );
        this.subtask = subtask;
        this.parentTaskId = parentTaskId;

        // Set icon based on completion status
        this.iconPath = new vscode.ThemeIcon(
            subtask.completed ? 'check' : 'circle-outline'
        );

        this.tooltip = subtask.title;
        this.contextValue = 'subtask';

        // Click command to toggle completion
        this.command = {
            command: 'braingrid.toggleTask',
            title: 'Toggle Subtask Completion',
            arguments: [parentTaskId, subtask.id]
        };
    }
}

/**
 * Research category item (top-level node).
 */
export class ResearchCategoryItem extends BrainGridTreeItem {
    constructor(sessionCount: number) {
        super(
            sessionCount > 0 ? `Research (${sessionCount})` : 'Research',
            sessionCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'research'
        );
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.description = sessionCount === 0 ? 'No research' : '';
        this.tooltip = `${sessionCount} research session${sessionCount !== 1 ? 's' : ''}`;
    }
}

/**
 * Individual research session item.
 */
export class ResearchSessionItem extends BrainGridTreeItem {
    public readonly research: ResearchResults;

    constructor(research: ResearchResults) {
        // Truncate query for label
        const truncatedQuery = research.query.length > 40
            ? research.query.substring(0, 40) + '...'
            : research.query;

        super(
            truncatedQuery,
            vscode.TreeItemCollapsibleState.None,
            'researchSession'
        );
        this.research = research;
        this.iconPath = new vscode.ThemeIcon('search');

        // Format date for description
        const date = research.timestamp instanceof Date
            ? research.timestamp
            : new Date(research.timestamp);
        this.description = this.formatDate(date);

        // Build detailed tooltip
        this.tooltip = this.buildTooltip(research);
        this.contextValue = 'researchSession';
    }

    private formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    private buildTooltip(research: ResearchResults): string {
        const lines = [
            `Query: ${research.query}`,
            '',
            `Findings: ${research.findings.length}`,
            `Summary: ${research.summary.substring(0, 200)}${research.summary.length > 200 ? '...' : ''}`
        ];
        return lines.join('\n');
    }
}

/**
 * Artifacts category item (top-level node for scan artifacts).
 */
export class ArtifactsCategoryItem extends BrainGridTreeItem {
    constructor(artifactCount: number) {
        super(
            artifactCount > 0 ? `Scan Artifacts (${artifactCount})` : 'Scan Artifacts',
            artifactCount > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            'artifacts'
        );
        this.iconPath = new vscode.ThemeIcon('archive');
        this.description = artifactCount === 0 ? 'No artifacts' : '';
        this.tooltip = `${artifactCount} scan artifact${artifactCount !== 1 ? 's' : ''} generated`;
    }
}

/**
 * Artifact info for tree display.
 */
export interface ArtifactInfo {
    type: string;
    filename: string;
    generatedAt: string;
    isDocumentation: boolean;
    filePath: string;
}

/**
 * Individual artifact item.
 */
export class ArtifactTreeItem extends BrainGridTreeItem {
    public readonly artifact: ArtifactInfo;

    constructor(artifact: ArtifactInfo) {
        // Create readable label from type
        const label = artifact.type
            .replace('-docs', ' (Doc)')
            .replace(/([A-Z])/g, ' $1')
            .trim();

        super(
            label,
            vscode.TreeItemCollapsibleState.None,
            'artifact'
        );
        this.artifact = artifact;

        // Set icon based on type
        this.iconPath = new vscode.ThemeIcon(
            artifact.isDocumentation ? 'markdown' : 'json'
        );

        // Format date for description
        const date = new Date(artifact.generatedAt);
        this.description = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        this.tooltip = `${artifact.filename}\nGenerated: ${artifact.generatedAt}`;
        this.contextValue = 'artifact';

        // Click to open the file
        this.command = {
            command: 'vscode.open',
            title: 'Open Artifact',
            arguments: [vscode.Uri.file(artifact.filePath)]
        };
    }
}

/**
 * Empty state item when no artifacts exist.
 */
export class EmptyStateItem extends BrainGridTreeItem {
    constructor(message: string) {
        super(
            message,
            vscode.TreeItemCollapsibleState.None,
            'empty'
        );
        this.iconPath = new vscode.ThemeIcon('info');
        this.tooltip = message;
    }
}
