/**
 * Workflow Detector
 * Identifies business workflows and operation patterns from API handlers,
 * function naming conventions, and call graphs.
 */
import * as path from 'path';
import { Project, SourceFile, SyntaxKind, FunctionDeclaration, ArrowFunction, CallExpression } from 'ts-morph';
import { ArtifactResult, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types';
import { listDirectory, isDirectory, pathExists, readFileSafe } from '../utils/fileSystem';
import { parseGitignore, isIgnored } from '../utils/gitignoreParser';
import {
    WorkflowType,
    matchWorkflowPattern,
    getDominantWorkflowType,
    resourceToWorkflowName,
    PatternMatch
} from '../utils/patternMatcher';

/**
 * HTTP methods supported in API routes
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * CRUD operation detected from an API route
 */
export interface CRUDOperation {
    /** HTTP method */
    method: HTTPMethod;
    /** CRUD operation type */
    operation: 'create' | 'read' | 'update' | 'delete';
    /** API endpoint path */
    endpoint: string;
    /** File path relative to workspace */
    filePath: string;
    /** Handler function name if available */
    handlerName?: string;
}

/**
 * A named handler function detected in the codebase
 */
export interface NamedHandler {
    /** Function name */
    name: string;
    /** File path relative to workspace */
    filePath: string;
    /** Detected workflow type */
    type: WorkflowType;
    /** Line number in the file */
    lineNumber: number;
    /** Whether the function is exported */
    isExported: boolean;
}

/**
 * An edge in the call graph
 */
export interface CallGraphEdge {
    /** Calling function name */
    caller: string;
    /** Called function name */
    callee: string;
    /** File path relative to workspace */
    filePath: string;
    /** Line number of the call */
    lineNumber: number;
}

/**
 * A detected workflow grouping related operations
 */
export interface Workflow {
    /** Workflow name */
    name: string;
    /** Workflow type */
    type: WorkflowType;
    /** Optional description */
    description?: string;
    /** CRUD operations in this workflow */
    operations: CRUDOperation[];
    /** Handler functions in this workflow */
    handlers: NamedHandler[];
    /** Ordered sequence of function calls */
    callSequence: string[];
}

/**
 * Complete workflow model
 */
export interface WorkflowModel {
    /** Grouped workflows */
    workflows: Workflow[];
    /** All detected CRUD operations */
    crudOperations: CRUDOperation[];
    /** All detected handlers */
    handlers: NamedHandler[];
    /** Call graph edges */
    callGraph: CallGraphEdge[];
}

/**
 * Mapping from HTTP methods to CRUD operations
 */
const HTTP_TO_CRUD: Record<HTTPMethod, CRUDOperation['operation']> = {
    'POST': 'create',
    'GET': 'read',
    'PUT': 'update',
    'PATCH': 'update',
    'DELETE': 'delete'
};

/**
 * HTTP methods to detect
 */
const HTTP_METHODS: HTTPMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Code file extensions
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Detects business workflows from API handlers and function patterns.
 */
export class WorkflowDetector {
    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private gitignorePatterns: string[] = [];
    private errorCount = 0;
    private fileCount = 0;
    private project: Project;

    /**
     * Create a new WorkflowDetector.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
        this.project = new Project({
            compilerOptions: { strict: true },
            skipAddingFilesFromTsConfig: true
        });
    }

    /**
     * Generate the workflow artifact.
     * @returns ArtifactResult with JSON content
     */
    async generate(): Promise<ArtifactResult> {
        // Reset state for fresh generation
        this.errorCount = 0;
        this.fileCount = 0;

        // Parse gitignore
        this.gitignorePatterns = await parseGitignore(this.workspacePath);

        // Gather all information in parallel
        const [crudOperations, handlersAndGraph] = await Promise.all([
            this.detectCRUDOperations(),
            this.extractHandlersAndCallGraph()
        ]);

        const { handlers, callGraph } = handlersAndGraph;

        // Group into workflows
        const workflows = this.groupIntoWorkflows(crudOperations, handlers, callGraph);

        const workflowModel: WorkflowModel = {
            workflows,
            crudOperations,
            handlers,
            callGraph
        };

        return {
            type: 'workflow',
            content: JSON.stringify(workflowModel, null, 2),
            generatedAt: new Date().toISOString(),
            fileCount: this.fileCount,
            errorCount: this.errorCount
        };
    }

    /**
     * Detect CRUD operations from API route files.
     */
    private async detectCRUDOperations(): Promise<CRUDOperation[]> {
        const operations: CRUDOperation[] = [];

        // Look for app/api directory (Next.js App Router)
        const apiDirs = ['app/api', 'src/app/api', 'pages/api', 'src/pages/api'];

        for (const apiDir of apiDirs) {
            const dirPath = path.join(this.workspacePath, apiDir);
            if (await pathExists(dirPath)) {
                await this.scanApiDirectory(dirPath, apiDir, operations);
            }
        }

        return operations;
    }

    /**
     * Recursively scan an API directory for route files.
     */
    private async scanApiDirectory(
        dirPath: string,
        basePath: string,
        operations: CRUDOperation[]
    ): Promise<void> {
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
                await this.scanApiDirectory(entryPath, basePath, operations);
            } else if (entry === 'route.ts' || entry === 'route.js') {
                this.fileCount++;
                await this.parseRouteFile(entryPath, relativePath, basePath, operations);
            }
        }
    }

    /**
     * Parse a Next.js route file for HTTP method exports.
     */
    private async parseRouteFile(
        filePath: string,
        relativePath: string,
        basePath: string,
        operations: CRUDOperation[]
    ): Promise<void> {
        try {
            const sourceFile = this.project.addSourceFileAtPath(filePath);
            const endpoint = this.extractEndpoint(relativePath, basePath);

            // Look for exported HTTP method functions
            for (const method of HTTP_METHODS) {
                const hasExport = this.hasExportedFunction(sourceFile, method);
                if (hasExport) {
                    operations.push({
                        method,
                        operation: HTTP_TO_CRUD[method],
                        endpoint,
                        filePath: relativePath,
                        handlerName: method
                    });
                }
            }
        } catch {
            this.errorCount++;
        }
    }

    /**
     * Check if a source file exports a function with the given name.
     */
    private hasExportedFunction(sourceFile: SourceFile, name: string): boolean {
        // Check for export function GET() {}
        for (const func of sourceFile.getFunctions()) {
            if (func.getName() === name && func.isExported()) {
                return true;
            }
        }

        // Check for export const GET = ...
        for (const varStmt of sourceFile.getVariableStatements()) {
            if (varStmt.isExported()) {
                for (const decl of varStmt.getDeclarations()) {
                    if (decl.getName() === name) {
                        return true;
                    }
                }
            }
        }

        // Check for export { GET }
        for (const exportDecl of sourceFile.getExportDeclarations()) {
            for (const namedExport of exportDecl.getNamedExports()) {
                if (namedExport.getName() === name) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Extract the API endpoint from a route file path.
     */
    private extractEndpoint(relativePath: string, basePath: string): string {
        // app/api/users/[id]/route.ts -> /api/users/[id]
        const normalizedPath = relativePath.replace(/\\/g, '/');

        // Remove the base path prefix and route.ts suffix
        let endpoint = normalizedPath
            .replace(/^app\//, '/')
            .replace(/^src\/app\//, '/')
            .replace(/^pages\//, '/')
            .replace(/^src\/pages\//, '/')
            .replace(/\/route\.[jt]sx?$/, '')
            .replace(/\/index\.[jt]sx?$/, '');

        // Ensure it starts with /api
        if (!endpoint.startsWith('/api')) {
            endpoint = '/api' + endpoint.replace(/^\/api/, '');
        }

        return endpoint || '/api';
    }

    /**
     * Extract named handlers and build call graph.
     */
    private async extractHandlersAndCallGraph(): Promise<{
        handlers: NamedHandler[];
        callGraph: CallGraphEdge[];
    }> {
        const handlers: NamedHandler[] = [];
        const callGraph: CallGraphEdge[] = [];

        await this.traverseForHandlers(this.workspacePath, 0, handlers, callGraph);

        return { handlers, callGraph };
    }

    /**
     * Recursively traverse directories for handlers and call graph.
     */
    private async traverseForHandlers(
        dirPath: string,
        depth: number,
        handlers: NamedHandler[],
        callGraph: CallGraphEdge[]
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
                await this.traverseForHandlers(entryPath, depth + 1, handlers, callGraph);
            } else if (this.isCodeFile(entry)) {
                this.fileCount++;
                await this.analyzeFileForHandlers(entryPath, relativePath, handlers, callGraph);
            }
        }
    }

    /**
     * Analyze a single file for handlers and call graph.
     */
    private async analyzeFileForHandlers(
        filePath: string,
        relativePath: string,
        handlers: NamedHandler[],
        callGraph: CallGraphEdge[]
    ): Promise<void> {
        try {
            const sourceFile = this.project.addSourceFileAtPath(filePath);

            // Extract named functions with workflow patterns
            const functionNames = new Set<string>();

            // Regular functions
            for (const func of sourceFile.getFunctions()) {
                const name = func.getName();
                if (name) {
                    functionNames.add(name);
                    const match = matchWorkflowPattern(name);
                    handlers.push({
                        name,
                        filePath: relativePath,
                        type: match?.type || 'unknown',
                        lineNumber: func.getStartLineNumber(),
                        isExported: func.isExported()
                    });

                    // Build call graph for this function
                    this.extractCallsFromFunction(func, name, relativePath, callGraph, functionNames);
                }
            }

            // Arrow functions in variable declarations
            for (const varStmt of sourceFile.getVariableStatements()) {
                for (const decl of varStmt.getDeclarations()) {
                    const name = decl.getName();
                    const initializer = decl.getInitializer();

                    if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
                        functionNames.add(name);
                        const match = matchWorkflowPattern(name);
                        handlers.push({
                            name,
                            filePath: relativePath,
                            type: match?.type || 'unknown',
                            lineNumber: decl.getStartLineNumber(),
                            isExported: varStmt.isExported()
                        });

                        // Build call graph for arrow function
                        const arrowFunc = initializer as ArrowFunction;
                        this.extractCallsFromArrowFunction(arrowFunc, name, relativePath, callGraph, functionNames);
                    }
                }
            }
        } catch {
            this.errorCount++;
        }
    }

    /**
     * Extract call graph edges from a function declaration.
     */
    private extractCallsFromFunction(
        func: FunctionDeclaration,
        callerName: string,
        filePath: string,
        callGraph: CallGraphEdge[],
        localFunctions: Set<string>
    ): void {
        const body = func.getBody();
        if (!body) return;

        const callExprs = body.getDescendantsOfKind(SyntaxKind.CallExpression) as CallExpression[];
        for (const callExpr of callExprs) {
            const callee = this.getCalleeName(callExpr);
            if (callee && localFunctions.has(callee)) {
                callGraph.push({
                    caller: callerName,
                    callee,
                    filePath,
                    lineNumber: callExpr.getStartLineNumber()
                });
            }
        }
    }

    /**
     * Extract call graph edges from an arrow function.
     */
    private extractCallsFromArrowFunction(
        func: ArrowFunction,
        callerName: string,
        filePath: string,
        callGraph: CallGraphEdge[],
        localFunctions: Set<string>
    ): void {
        const callExprs = func.getDescendantsOfKind(SyntaxKind.CallExpression) as CallExpression[];
        for (const callExpr of callExprs) {
            const callee = this.getCalleeName(callExpr);
            if (callee && localFunctions.has(callee)) {
                callGraph.push({
                    caller: callerName,
                    callee,
                    filePath,
                    lineNumber: callExpr.getStartLineNumber()
                });
            }
        }
    }

    /**
     * Get the name of the called function from a call expression.
     */
    private getCalleeName(callExpr: CallExpression): string | null {
        const expression = callExpr.getExpression();
        const text = expression.getText();

        // Simple function call: functionName()
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text)) {
            return text;
        }

        // Ignore method calls like obj.method()
        return null;
    }

    /**
     * Group CRUD operations and handlers into workflows.
     */
    private groupIntoWorkflows(
        crudOperations: CRUDOperation[],
        handlers: NamedHandler[],
        callGraph: CallGraphEdge[]
    ): Workflow[] {
        const workflows: Workflow[] = [];
        const usedOperations = new Set<CRUDOperation>();
        const usedHandlers = new Set<NamedHandler>();

        // Group by resource (from API endpoints)
        const resourceGroups = new Map<string, {
            operations: CRUDOperation[];
            handlers: NamedHandler[];
        }>();

        for (const op of crudOperations) {
            const resource = this.extractResource(op.endpoint);
            if (!resourceGroups.has(resource)) {
                resourceGroups.set(resource, { operations: [], handlers: [] });
            }
            resourceGroups.get(resource)!.operations.push(op);
            usedOperations.add(op);
        }

        // Match handlers to resources based on file path
        for (const handler of handlers) {
            for (const [resource, group] of resourceGroups) {
                if (handler.filePath.toLowerCase().includes(resource.toLowerCase())) {
                    group.handlers.push(handler);
                    usedHandlers.add(handler);
                    break;
                }
            }
        }

        // Create workflows from resource groups
        for (const [resource, group] of resourceGroups) {
            const handlerMatches = group.handlers.map(h => matchWorkflowPattern(h.name)).filter(Boolean) as PatternMatch[];
            const workflowType = group.handlers.length > 0
                ? getDominantWorkflowType(handlerMatches)
                : 'crud';

            const callSequence = this.buildCallSequence(group.handlers, callGraph);

            workflows.push({
                name: resourceToWorkflowName(resource),
                type: workflowType,
                operations: group.operations,
                handlers: group.handlers,
                callSequence
            });
        }

        // Group remaining handlers by workflow type
        const typeGroups = new Map<WorkflowType, NamedHandler[]>();
        for (const handler of handlers) {
            if (usedHandlers.has(handler)) continue;
            if (handler.type === 'unknown') continue;

            if (!typeGroups.has(handler.type)) {
                typeGroups.set(handler.type, []);
            }
            typeGroups.get(handler.type)!.push(handler);
        }

        // Create workflows from type groups
        for (const [type, groupHandlers] of typeGroups) {
            if (groupHandlers.length < 2) continue; // Only create workflow if multiple handlers

            const callSequence = this.buildCallSequence(groupHandlers, callGraph);

            workflows.push({
                name: this.typeToWorkflowName(type),
                type,
                operations: [],
                handlers: groupHandlers,
                callSequence
            });
        }

        return workflows;
    }

    /**
     * Extract the resource name from an API endpoint.
     */
    private extractResource(endpoint: string): string {
        // /api/users/[id] -> users
        // /api/auth/login -> auth
        const parts = endpoint.split('/').filter(Boolean);

        // Skip 'api' prefix
        const resourceIndex = parts[0] === 'api' ? 1 : 0;
        return parts[resourceIndex] || 'root';
    }

    /**
     * Build a call sequence from handlers and call graph.
     */
    private buildCallSequence(
        handlers: NamedHandler[],
        callGraph: CallGraphEdge[]
    ): string[] {
        if (handlers.length === 0) return [];

        const handlerNames = new Set(handlers.map(h => h.name));
        const sequence: string[] = [];
        const visited = new Set<string>();

        // Find edges within this handler group
        const relevantEdges = callGraph.filter(
            e => handlerNames.has(e.caller) || handlerNames.has(e.callee)
        );

        // Build sequence using topological-like ordering
        const callers = new Set(relevantEdges.map(e => e.caller));
        const callees = new Set(relevantEdges.map(e => e.callee));

        // Start with functions that are only callers (entry points)
        for (const name of handlerNames) {
            if (callers.has(name) && !callees.has(name)) {
                this.addToSequence(name, relevantEdges, sequence, visited);
            }
        }

        // Add remaining handlers
        for (const handler of handlers) {
            if (!visited.has(handler.name)) {
                sequence.push(handler.name);
                visited.add(handler.name);
            }
        }

        return sequence;
    }

    /**
     * Recursively add functions to sequence following call order.
     */
    private addToSequence(
        name: string,
        edges: CallGraphEdge[],
        sequence: string[],
        visited: Set<string>
    ): void {
        if (visited.has(name)) return;

        visited.add(name);
        sequence.push(name);

        // Find functions called by this one
        const callees = edges.filter(e => e.caller === name).map(e => e.callee);
        for (const callee of callees) {
            this.addToSequence(callee, edges, sequence, visited);
        }
    }

    /**
     * Convert a workflow type to a human-readable name.
     */
    private typeToWorkflowName(type: WorkflowType): string {
        const names: Record<WorkflowType, string> = {
            'authentication': 'Authentication',
            'payment': 'Payment Processing',
            'notification': 'Notifications',
            'data-sync': 'Data Synchronization',
            'validation': 'Validation',
            'crud': 'Data Operations',
            'unknown': 'Other Operations'
        };
        return names[type];
    }

    /**
     * Check if a file is a code file.
     */
    private isCodeFile(filename: string): boolean {
        return CODE_EXTENSIONS.some(ext => filename.endsWith(ext));
    }
}
