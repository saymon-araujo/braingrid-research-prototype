/**
 * Gitignore pattern parsing and matching utilities
 */
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Parse .gitignore file and return patterns.
 * @param workspacePath - Root path of the workspace
 * @returns Array of gitignore patterns
 */
export async function parseGitignore(workspacePath: string): Promise<string[]> {
    const gitignorePath = path.join(workspacePath, '.gitignore');
    try {
        const content = await fs.promises.readFile(gitignorePath, 'utf-8');
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    } catch {
        return [];
    }
}

/**
 * Check if a path should be ignored based on patterns.
 * @param relativePath - Path relative to workspace root
 * @param patterns - Array of gitignore patterns
 * @param isDir - Whether the path is a directory
 * @returns true if path should be ignored
 */
export function isIgnored(
    relativePath: string,
    patterns: string[],
    isDir: boolean
): boolean {
    for (const pattern of patterns) {
        // Handle negation patterns
        if (pattern.startsWith('!')) {
            if (matchPattern(relativePath, pattern.slice(1), isDir)) {
                return false; // Negation - explicitly include
            }
            continue;
        }
        if (matchPattern(relativePath, pattern, isDir)) {
            return true;
        }
    }
    return false;
}

/**
 * Match a path against a gitignore pattern.
 * @param relativePath - Path relative to workspace root
 * @param pattern - Gitignore pattern
 * @param isDir - Whether the path is a directory
 * @returns true if pattern matches
 */
function matchPattern(relativePath: string, pattern: string, isDir: boolean): boolean {
    // Directory-only patterns end with /
    if (pattern.endsWith('/')) {
        if (!isDir) return false;
        pattern = pattern.slice(0, -1);
    }

    // Check basename match for patterns without /
    if (!pattern.includes('/')) {
        const basename = path.basename(relativePath);
        if (minimatch(basename, pattern, { dot: true })) {
            return true;
        }
    }

    // Full path match
    return minimatch(relativePath, pattern, { dot: true }) ||
           minimatch(relativePath, `**/${pattern}`, { dot: true });
}
