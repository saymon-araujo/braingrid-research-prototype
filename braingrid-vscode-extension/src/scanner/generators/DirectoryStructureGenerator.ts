/**
 * Directory Structure Generator
 * Generates a navigable markdown representation of the workspace file tree.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ArtifactResult, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types';
import { isDirectory, listDirectory, isCircularSymlink } from '../utils/fileSystem';
import { parseGitignore, isIgnored } from '../utils/gitignoreParser';

/**
 * Node in the directory tree
 */
interface TreeNode {
    name: string;
    isDirectory: boolean;
    children?: TreeNode[];
    fileCount?: number;
    totalSize?: number;
}

/**
 * Generates markdown representation of directory structure.
 */
export class DirectoryStructureGenerator {
    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private gitignorePatterns: string[] = [];
    private visitedPaths: Set<string> = new Set();
    private errorCount = 0;
    private totalFiles = 0;

    /**
     * Create a new DirectoryStructureGenerator.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    }

    /**
     * Generate the directory structure artifact.
     * @returns ArtifactResult with markdown content
     */
    async generate(): Promise<ArtifactResult> {
        // Reset state for fresh generation
        this.visitedPaths.clear();
        this.errorCount = 0;
        this.totalFiles = 0;

        // Parse gitignore
        this.gitignorePatterns = await parseGitignore(this.workspacePath);

        // Traverse directory
        const rootNode = await this.traverseDirectory(this.workspacePath, 0);

        // Format as markdown
        const content = this.formatAsMarkdown(rootNode);

        return {
            type: 'directory',
            content,
            generatedAt: new Date().toISOString(),
            fileCount: this.totalFiles,
            errorCount: this.errorCount
        };
    }

    /**
     * Recursively traverse a directory and build the tree structure.
     */
    private async traverseDirectory(dirPath: string, depth: number): Promise<TreeNode> {
        const name = path.basename(dirPath) || path.basename(this.workspacePath);
        const node: TreeNode = {
            name,
            isDirectory: true,
            children: [],
            fileCount: 0,
            totalSize: 0
        };

        // Check depth limit
        if (depth >= this.options.maxDepth) {
            node.children = [{ name: '... (depth limit reached)', isDirectory: false }];
            return node;
        }

        // Check circular symlink
        if (await isCircularSymlink(dirPath, this.visitedPaths)) {
            node.children = [{ name: '... (circular symlink)', isDirectory: false }];
            return node;
        }

        // List and sort entries
        const entries = await listDirectory(dirPath);
        const sortedEntries = entries.sort((a, b) => {
            // Directories first, then alphabetical
            return a.localeCompare(b);
        });

        for (const entry of sortedEntries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.shouldExclude(entry, relativePath, isDir)) {
                continue;
            }

            if (isDir) {
                const childNode = await this.traverseDirectory(entryPath, depth + 1);
                node.children!.push(childNode);
                node.fileCount! += childNode.fileCount || 0;
                node.totalSize! += childNode.totalSize || 0;
            } else {
                const size = await this.getFileSizeSafe(entryPath);
                node.children!.push({ name: entry, isDirectory: false });
                node.fileCount!++;
                node.totalSize! += size;
                this.totalFiles++;
            }
        }

        return node;
    }

    /**
     * Check if an entry should be excluded from the tree.
     */
    private shouldExclude(name: string, relativePath: string, isDir: boolean): boolean {
        // Check standard exclusions (by name)
        if (this.options.excludePatterns.includes(name)) {
            return true;
        }
        // Check gitignore patterns
        return isIgnored(relativePath, this.gitignorePatterns, isDir);
    }

    /**
     * Get file size safely, returning 0 on error.
     */
    private async getFileSizeSafe(filePath: string): Promise<number> {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.size;
        } catch {
            this.errorCount++;
            return 0;
        }
    }

    /**
     * Format the tree as markdown.
     */
    private formatAsMarkdown(node: TreeNode): string {
        const lines: string[] = ['# Directory Structure', ''];
        const workspaceName = path.basename(this.workspacePath);
        lines.push('```');
        lines.push(`${workspaceName}/`);
        if (node.children) {
            this.formatNode(node.children, '', lines);
        }
        lines.push('```');
        lines.push('');
        lines.push(`**Total files:** ${this.totalFiles}`);
        lines.push(`**Total size:** ${this.formatSize(node.totalSize || 0)}`);
        return lines.join('\n');
    }

    /**
     * Format tree nodes with proper indentation and box-drawing characters.
     */
    private formatNode(nodes: TreeNode[], prefix: string, lines: string[]): void {
        nodes.forEach((node, index) => {
            const isLast = index === nodes.length - 1;
            const connector = isLast ? '└── ' : '├── ';

            // Add size info for directories
            const sizeInfo = node.isDirectory && node.fileCount !== undefined
                ? ` (${node.fileCount} files, ${this.formatSize(node.totalSize || 0)})`
                : '';

            const suffix = node.isDirectory ? '/' : '';
            lines.push(`${prefix}${connector}${node.name}${suffix}${sizeInfo}`);

            // Recurse into children
            if (node.children && node.children.length > 0) {
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                this.formatNode(node.children, newPrefix, lines);
            }
        });
    }

    /**
     * Format bytes as human-readable size.
     */
    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
}
