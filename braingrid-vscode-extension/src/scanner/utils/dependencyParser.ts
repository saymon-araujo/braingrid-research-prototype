/**
 * Dependency parsing utilities for multiple package manager formats
 */
import * as path from 'path';
import { readFileSafe } from './fileSystem';

/**
 * Normalized dependency information from any package manager
 */
export interface DependencyInfo {
    dependencies: string[];
    devDependencies: string[];
    name?: string;
    version?: string;
    description?: string;
}

const MAX_DEPENDENCY_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Parse package.json (Node.js)
 * @param workspacePath - Root path of the workspace
 * @returns Parsed dependency info or null if file doesn't exist/is invalid
 */
export async function parsePackageJson(workspacePath: string): Promise<DependencyInfo | null> {
    const filePath = path.join(workspacePath, 'package.json');
    const content = await readFileSafe(filePath, MAX_DEPENDENCY_FILE_SIZE);
    if (!content) return null;

    try {
        const pkg = JSON.parse(content);
        return {
            dependencies: Object.keys(pkg.dependencies || {}),
            devDependencies: Object.keys(pkg.devDependencies || {}),
            name: pkg.name,
            version: pkg.version,
            description: pkg.description
        };
    } catch {
        return null;
    }
}

/**
 * Parse requirements.txt (Python)
 * @param workspacePath - Root path of the workspace
 * @returns Parsed dependency info or null if file doesn't exist
 */
export async function parseRequirementsTxt(workspacePath: string): Promise<DependencyInfo | null> {
    const filePath = path.join(workspacePath, 'requirements.txt');
    const content = await readFileSafe(filePath, MAX_DEPENDENCY_FILE_SIZE);
    if (!content) return null;

    const dependencies = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && !line.startsWith('-'))
        .map(line => line.split(/[=<>!~\[;]/, 1)[0].trim())
        .filter(Boolean);

    return { dependencies, devDependencies: [] };
}

/**
 * Parse go.mod (Go)
 * @param workspacePath - Root path of the workspace
 * @returns Parsed dependency info or null if file doesn't exist
 */
export async function parseGoMod(workspacePath: string): Promise<DependencyInfo | null> {
    const filePath = path.join(workspacePath, 'go.mod');
    const content = await readFileSafe(filePath, MAX_DEPENDENCY_FILE_SIZE);
    if (!content) return null;

    const dependencies: string[] = [];

    // Match require block: require ( ... )
    const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/);
    if (requireBlock) {
        const lines = requireBlock[1].split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('//')) {
                const match = trimmed.match(/^([^\s]+)/);
                if (match) {
                    dependencies.push(match[1]);
                }
            }
        }
    }

    // Single-line requires: require module/path v1.0.0
    const singleRequires = content.matchAll(/require\s+([^\s(]+)\s+v/g);
    for (const match of singleRequires) {
        if (!dependencies.includes(match[1])) {
            dependencies.push(match[1]);
        }
    }

    // Extract module name
    const moduleMatch = content.match(/module\s+([^\s]+)/);

    return {
        dependencies,
        devDependencies: [],
        name: moduleMatch?.[1]
    };
}

/**
 * Parse Cargo.toml (Rust)
 * @param workspacePath - Root path of the workspace
 * @returns Parsed dependency info or null if file doesn't exist
 */
export async function parseCargoToml(workspacePath: string): Promise<DependencyInfo | null> {
    const filePath = path.join(workspacePath, 'Cargo.toml');
    const content = await readFileSafe(filePath, MAX_DEPENDENCY_FILE_SIZE);
    if (!content) return null;

    const dependencies: string[] = [];
    const devDependencies: string[] = [];

    // Match [dependencies] section
    const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
    if (depsMatch) {
        const depLines = depsMatch[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm);
        for (const match of depLines) {
            dependencies.push(match[1]);
        }
    }

    // Match [dev-dependencies] section
    const devDepsMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?=\[|$)/);
    if (devDepsMatch) {
        const depLines = devDepsMatch[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=/gm);
        for (const match of depLines) {
            devDependencies.push(match[1]);
        }
    }

    // Extract package name from [package] section
    const nameMatch = content.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/);
    const descMatch = content.match(/\[package\][\s\S]*?description\s*=\s*"([^"]+)"/);

    return {
        dependencies,
        devDependencies,
        name: nameMatch?.[1],
        description: descMatch?.[1]
    };
}

/**
 * Parse all dependency files in workspace and combine results.
 * @param workspacePath - Root path of the workspace
 * @returns Combined dependency info from all detected package managers
 */
export async function parseAllDependencies(workspacePath: string): Promise<DependencyInfo> {
    const results = await Promise.all([
        parsePackageJson(workspacePath),
        parseRequirementsTxt(workspacePath),
        parseGoMod(workspacePath),
        parseCargoToml(workspacePath)
    ]);

    const combined: DependencyInfo = {
        dependencies: [],
        devDependencies: []
    };

    for (const result of results) {
        if (result) {
            combined.dependencies.push(...result.dependencies);
            combined.devDependencies.push(...result.devDependencies);
            if (result.name && !combined.name) combined.name = result.name;
            if (result.version && !combined.version) combined.version = result.version;
            if (result.description && !combined.description) combined.description = result.description;
        }
    }

    return combined;
}
