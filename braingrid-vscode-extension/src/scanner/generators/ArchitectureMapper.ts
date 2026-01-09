/**
 * Architecture Mapper
 * Identifies application layers and component dependencies.
 */
import * as path from 'path';
import { ArtifactResult, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types';
import { listDirectory, isDirectory, pathExists } from '../utils/fileSystem';
import { parseGitignore, isIgnored } from '../utils/gitignoreParser';
import { ImportAnalyzer, ImportInfo } from '../utils/importAnalyzer';

/**
 * Architecture layer types
 */
export type ArchitectureLayer =
    | 'presentation'   // UI components, pages
    | 'api'            // API routes, controllers
    | 'business'       // Services, use cases
    | 'data'           // Repositories, database access
    | 'infrastructure' // Config, utilities, shared
    | 'unknown';

/**
 * Entry point types
 */
export type EntryPointType =
    | 'main'           // Main application entry
    | 'api-route'      // API route handler
    | 'page'           // Page component
    | 'worker'         // Background worker
    | 'cli';           // CLI entry

/**
 * An application entry point
 */
export interface EntryPoint {
    filePath: string;
    type: EntryPointType;
    name: string;
}

/**
 * Information about an architecture layer
 */
export interface LayerInfo {
    layer: ArchitectureLayer;
    directories: string[];
    fileCount: number;
}

/**
 * A dependency edge between files
 */
export interface DependencyEdge {
    from: string;      // Source file path
    to: string;        // Target file/module
    importType: 'relative' | 'alias' | 'external';
}

/**
 * Complete architecture model
 */
export interface ArchitectureModel {
    layers: LayerInfo[];
    entryPoints: EntryPoint[];
    dependencies: DependencyEdge[];
    externalDependencies: string[];
}

/**
 * Layer detection by folder name patterns
 */
const LAYER_PATTERNS: Record<Exclude<ArchitectureLayer, 'unknown'>, string[]> = {
    'presentation': [
        'components', 'pages', 'views', 'screens', 'ui',
        'app', 'src/app', 'src/pages', 'src/components'
    ],
    'api': [
        'api', 'routes', 'controllers', 'handlers',
        'app/api', 'src/api', 'pages/api'
    ],
    'business': [
        'services', 'usecases', 'use-cases', 'domain',
        'core', 'business', 'logic'
    ],
    'data': [
        'repositories', 'repos', 'data', 'database', 'db',
        'models', 'entities', 'prisma'
    ],
    'infrastructure': [
        'lib', 'utils', 'helpers', 'config', 'shared',
        'common', 'infrastructure', 'adapters'
    ]
};

/**
 * Entry point file patterns
 */
const ENTRY_POINT_PATTERNS: Record<EntryPointType, string[]> = {
    'main': ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js'],
    'api-route': ['route.ts', 'route.js'],
    'page': ['page.tsx', 'page.jsx', 'page.ts', 'page.js'],
    'worker': ['worker.ts', 'worker.js'],
    'cli': ['cli.ts', 'cli.js', 'bin.ts', 'bin.js']
};

/**
 * Code file extensions
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Maps folders to architectural layers and builds dependency graph.
 */
export class ArchitectureMapper {
    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private gitignorePatterns: string[] = [];
    private errorCount = 0;
    private fileCount = 0;

    /**
     * Create a new ArchitectureMapper.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    }

    /**
     * Generate the architecture artifact.
     * @returns ArtifactResult with JSON content
     */
    async generate(): Promise<ArtifactResult> {
        // Reset state for fresh generation
        this.errorCount = 0;
        this.fileCount = 0;

        // Parse gitignore
        this.gitignorePatterns = await parseGitignore(this.workspacePath);

        // Gather all information in parallel
        const [layers, entryPoints, dependencyInfo] = await Promise.all([
            this.detectLayers(),
            this.findEntryPoints(),
            this.analyzeDependencies()
        ]);

        const architecture: ArchitectureModel = {
            layers,
            entryPoints,
            dependencies: dependencyInfo.dependencies,
            externalDependencies: dependencyInfo.externalDeps
        };

        return {
            type: 'architecture',
            content: JSON.stringify(architecture, null, 2),
            generatedAt: new Date().toISOString(),
            fileCount: this.fileCount,
            errorCount: this.errorCount
        };
    }

    /**
     * Detect architecture layers by scanning directories.
     */
    private async detectLayers(): Promise<LayerInfo[]> {
        const layerCounts: Record<ArchitectureLayer, { dirs: Set<string>; files: number }> = {
            'presentation': { dirs: new Set(), files: 0 },
            'api': { dirs: new Set(), files: 0 },
            'business': { dirs: new Set(), files: 0 },
            'data': { dirs: new Set(), files: 0 },
            'infrastructure': { dirs: new Set(), files: 0 },
            'unknown': { dirs: new Set(), files: 0 }
        };

        await this.traverseForLayers(this.workspacePath, 0, layerCounts);

        // Convert to LayerInfo array, excluding 'unknown' if empty
        return Object.entries(layerCounts)
            .filter(([layer, info]) => layer !== 'unknown' && (info.dirs.size > 0 || info.files > 0))
            .map(([layer, info]) => ({
                layer: layer as ArchitectureLayer,
                directories: Array.from(info.dirs).sort(),
                fileCount: info.files
            }));
    }

    /**
     * Recursively traverse directories to classify layers.
     */
    private async traverseForLayers(
        dirPath: string,
        depth: number,
        counts: Record<ArchitectureLayer, { dirs: Set<string>; files: number }>
    ): Promise<void> {
        if (depth >= this.options.maxDepth) return;

        let entries: string[];
        try {
            entries = await listDirectory(dirPath);
        } catch {
            return;
        }

        const relativeDirPath = path.relative(this.workspacePath, dirPath);

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.options.excludePatterns.includes(entry)) continue;
            if (isIgnored(relativePath, this.gitignorePatterns, isDir)) continue;

            if (isDir) {
                // Classify the directory
                const dirLayer = this.classifyDirectory(relativePath);
                if (dirLayer !== 'unknown') {
                    counts[dirLayer].dirs.add(relativePath);
                }
                await this.traverseForLayers(entryPath, depth + 1, counts);
            } else if (this.isCodeFile(entry)) {
                // Classify file based on parent directory
                const parentLayer = this.classifyDirectory(relativeDirPath || '.');
                counts[parentLayer].files++;
            }
        }
    }

    /**
     * Classify a directory into an architecture layer.
     */
    private classifyDirectory(relativePath: string): ArchitectureLayer {
        if (!relativePath || relativePath === '.') {
            return 'unknown';
        }

        const normalizedPath = relativePath.toLowerCase().replace(/\\/g, '/');
        const segments = normalizedPath.split('/');

        // Check for API layer first (more specific patterns)
        if (normalizedPath.includes('/api/') || normalizedPath.endsWith('/api') ||
            segments.includes('api')) {
            return 'api';
        }

        // Check each layer pattern
        for (const [layer, patterns] of Object.entries(LAYER_PATTERNS)) {
            for (const pattern of patterns) {
                const normalizedPattern = pattern.toLowerCase();
                if (normalizedPath === normalizedPattern ||
                    normalizedPath.startsWith(normalizedPattern + '/') ||
                    segments.includes(normalizedPattern) ||
                    segments.some(s => s === normalizedPattern.split('/').pop())) {
                    return layer as ArchitectureLayer;
                }
            }
        }

        return 'unknown';
    }

    /**
     * Find all entry points in the codebase.
     */
    private async findEntryPoints(): Promise<EntryPoint[]> {
        const entryPoints: EntryPoint[] = [];
        await this.traverseForEntryPoints(this.workspacePath, 0, entryPoints);
        return entryPoints;
    }

    /**
     * Recursively traverse directories to find entry points.
     */
    private async traverseForEntryPoints(
        dirPath: string,
        depth: number,
        entryPoints: EntryPoint[]
    ): Promise<void> {
        if (depth >= this.options.maxDepth) return;

        let entries: string[];
        try {
            entries = await listDirectory(dirPath);
        } catch {
            return;
        }

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.options.excludePatterns.includes(entry)) continue;
            if (isIgnored(relativePath, this.gitignorePatterns, isDir)) continue;

            if (isDir) {
                await this.traverseForEntryPoints(entryPath, depth + 1, entryPoints);
            } else {
                const entryPointType = this.classifyEntryPoint(entry, relativePath);
                if (entryPointType) {
                    entryPoints.push({
                        filePath: relativePath,
                        type: entryPointType,
                        name: this.getEntryPointName(relativePath, entryPointType)
                    });
                }
            }
        }
    }

    /**
     * Classify a file as an entry point type.
     */
    private classifyEntryPoint(filename: string, relativePath: string): EntryPointType | null {
        const lowerFilename = filename.toLowerCase();
        const normalizedPath = relativePath.toLowerCase().replace(/\\/g, '/');

        // Check API routes (Next.js app router)
        if (normalizedPath.includes('app/api/') &&
            ENTRY_POINT_PATTERNS['api-route'].some(p => lowerFilename === p)) {
            return 'api-route';
        }

        // Check pages (Next.js app router) - but not in api directory
        if (normalizedPath.includes('app/') &&
            !normalizedPath.includes('/api/') &&
            ENTRY_POINT_PATTERNS['page'].some(p => lowerFilename === p)) {
            return 'page';
        }

        // Check main entry points (only at root or src level)
        const pathDepth = relativePath.split(/[/\\]/).length;
        if (pathDepth <= 2) {
            if (ENTRY_POINT_PATTERNS['main'].some(p => lowerFilename === p)) {
                return 'main';
            }
        }

        // Check worker and CLI patterns
        if (ENTRY_POINT_PATTERNS['worker'].some(p => lowerFilename === p)) {
            return 'worker';
        }
        if (ENTRY_POINT_PATTERNS['cli'].some(p => lowerFilename === p)) {
            return 'cli';
        }

        return null;
    }

    /**
     * Get a human-readable name for an entry point.
     */
    private getEntryPointName(relativePath: string, type: EntryPointType): string {
        const normalizedPath = relativePath.replace(/\\/g, '/');

        if (type === 'api-route') {
            // Extract API route name: app/api/users/route.ts -> /api/users
            const match = normalizedPath.match(/app(\/api\/[^/]+(?:\/[^/]+)*?)\/route\.[jt]sx?$/i);
            return match ? match[1] : '/api' + normalizedPath.replace(/^.*app\/api/i, '').replace(/\/route\.[jt]sx?$/i, '');
        }

        if (type === 'page') {
            // Extract page name: app/dashboard/page.tsx -> /dashboard
            const match = normalizedPath.match(/app((?:\/[^/]+)*?)\/page\.[jt]sx?$/i);
            if (match) {
                return match[1] || '/';
            }
            return normalizedPath.replace(/\/page\.[jt]sx?$/i, '').replace(/^app/i, '') || '/';
        }

        // For other types, use the filename without extension
        return path.basename(relativePath, path.extname(relativePath));
    }

    /**
     * Analyze dependencies by parsing imports.
     */
    private async analyzeDependencies(): Promise<{
        dependencies: DependencyEdge[];
        externalDeps: string[];
    }> {
        const dependencies: DependencyEdge[] = [];
        const externalDepsSet = new Set<string>();
        const analyzer = new ImportAnalyzer();

        await this.traverseForDependencies(
            this.workspacePath,
            0,
            analyzer,
            dependencies,
            externalDepsSet
        );

        return {
            dependencies,
            externalDeps: Array.from(externalDepsSet).sort()
        };
    }

    /**
     * Recursively traverse directories to analyze dependencies.
     */
    private async traverseForDependencies(
        dirPath: string,
        depth: number,
        analyzer: ImportAnalyzer,
        dependencies: DependencyEdge[],
        externalDeps: Set<string>
    ): Promise<void> {
        if (depth >= this.options.maxDepth) return;

        let entries: string[];
        try {
            entries = await listDirectory(dirPath);
        } catch {
            return;
        }

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.options.excludePatterns.includes(entry)) continue;
            if (isIgnored(relativePath, this.gitignorePatterns, isDir)) continue;

            if (isDir) {
                await this.traverseForDependencies(
                    entryPath,
                    depth + 1,
                    analyzer,
                    dependencies,
                    externalDeps
                );
            } else if (this.isCodeFile(entry)) {
                this.fileCount++;
                try {
                    const fileDep = analyzer.analyzeFile(entryPath);

                    for (const imp of fileDep.imports) {
                        if (imp.isExternal) {
                            // Extract package name from external import
                            const packageName = this.extractPackageName(imp.source);
                            if (packageName) {
                                externalDeps.add(packageName);
                            }
                        } else {
                            // Internal dependency
                            dependencies.push({
                                from: relativePath,
                                to: imp.source,
                                importType: imp.isRelative ? 'relative' : 'alias'
                            });
                        }
                    }
                } catch {
                    this.errorCount++;
                }
            }
        }
    }

    /**
     * Extract the package name from an import source.
     */
    private extractPackageName(source: string): string | null {
        if (!source || source.startsWith('.') || source.startsWith('@/') || source.startsWith('~')) {
            return null;
        }

        // Scoped packages: @scope/package
        if (source.startsWith('@')) {
            const parts = source.split('/');
            if (parts.length >= 2) {
                return `${parts[0]}/${parts[1]}`;
            }
            return parts[0];
        }

        // Regular packages: package or package/subpath
        const parts = source.split('/');
        return parts[0];
    }

    /**
     * Check if a file is a code file.
     */
    private isCodeFile(filename: string): boolean {
        return CODE_EXTENSIONS.some(ext => filename.endsWith(ext));
    }
}
