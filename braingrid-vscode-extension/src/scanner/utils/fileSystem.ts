/**
 * File system utility functions for the scanner
 */
import * as fs from 'fs';
import * as path from 'path';
import { BINARY_EXTENSIONS } from '../types';

/**
 * Check if a file is binary based on its extension.
 * @param filePath - Path to the file
 * @returns true if file has a binary extension
 */
export function isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
}

/**
 * Get file size in bytes.
 * @param filePath - Path to the file
 * @returns File size in bytes, or -1 if file doesn't exist or can't be accessed
 */
export async function getFileSize(filePath: string): Promise<number> {
    try {
        const stats = await fs.promises.stat(filePath);
        return stats.size;
    } catch {
        return -1;
    }
}

/**
 * Safely read a file with size limit.
 * @param filePath - Path to the file
 * @param maxSize - Maximum file size in bytes
 * @returns File content, or null if file is too large, binary, or can't be read
 */
export async function readFileSafe(
    filePath: string,
    maxSize: number
): Promise<string | null> {
    // Skip binary files
    if (isBinaryFile(filePath)) {
        return null;
    }

    try {
        const stats = await fs.promises.stat(filePath);

        // Skip files exceeding size limit
        if (stats.size > maxSize) {
            return null;
        }

        const content = await fs.promises.readFile(filePath, 'utf-8');
        return content;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        // Return null for common errors, let caller handle
        if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EISDIR') {
            return null;
        }
        // Try Latin-1 fallback for encoding errors
        if (err.message?.includes('encoding')) {
            try {
                const buffer = await fs.promises.readFile(filePath);
                return buffer.toString('latin1');
            } catch {
                return null;
            }
        }
        return null;
    }
}

/**
 * Check if a path is a circular symlink.
 * @param filePath - Path to check
 * @param visited - Set of already visited real paths
 * @returns true if the path creates a circular reference
 */
export async function isCircularSymlink(
    filePath: string,
    visited: Set<string>
): Promise<boolean> {
    try {
        const realPath = await fs.promises.realpath(filePath);
        if (visited.has(realPath)) {
            return true;
        }
        visited.add(realPath);
        return false;
    } catch {
        // If we can't resolve the path, treat as non-circular
        return false;
    }
}

/**
 * Check if a path is a directory.
 * @param filePath - Path to check
 * @returns true if path is a directory
 */
export async function isDirectory(filePath: string): Promise<boolean> {
    try {
        const stats = await fs.promises.stat(filePath);
        return stats.isDirectory();
    } catch {
        return false;
    }
}

/**
 * Check if a path exists.
 * @param filePath - Path to check
 * @returns true if path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * List directory contents.
 * @param dirPath - Directory path
 * @returns Array of entry names, or empty array on error
 */
export async function listDirectory(dirPath: string): Promise<string[]> {
    try {
        return await fs.promises.readdir(dirPath);
    } catch {
        return [];
    }
}
