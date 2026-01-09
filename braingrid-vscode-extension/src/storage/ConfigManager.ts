import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StorageManager } from './StorageManager';
import { Config, ScanOptions, DEFAULT_CONFIG } from './types';

const CONFIG_FILE = 'config.json';
const API_KEY_SECRET_KEY = 'braingrid.apiKey';

/**
 * ConfigManager handles configuration persistence including secure API key storage
 * using VS Code's SecretStorage API.
 */
export class ConfigManager {
    private readonly secretStorage: vscode.SecretStorage;
    private readonly storageManager: StorageManager;
    private readonly configPath: string;

    constructor(storageManager: StorageManager, context: vscode.ExtensionContext) {
        this.storageManager = storageManager;
        this.secretStorage = context.secrets;
        this.configPath = path.join(storageManager.braingridPath, CONFIG_FILE);
    }

    /**
     * Save API key securely to OS keychain via VS Code SecretStorage.
     * @param key - The API key to store
     */
    async saveApiKey(key: string): Promise<void> {
        try {
            await this.secretStorage.store(API_KEY_SECRET_KEY, key);
        } catch (error) {
            throw new Error('Failed to save API key securely');
        }
    }

    /**
     * Load API key from OS keychain via VS Code SecretStorage.
     * @returns The API key, or null if not found
     */
    async loadApiKey(): Promise<string | null> {
        try {
            const key = await this.secretStorage.get(API_KEY_SECRET_KEY);
            return key ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Delete API key from OS keychain.
     */
    async deleteApiKey(): Promise<void> {
        try {
            await this.secretStorage.delete(API_KEY_SECRET_KEY);
        } catch {
            // Ignore errors when deleting
        }
    }

    /**
     * Save configuration to config.json file.
     * @param config - Partial config to merge with existing settings
     */
    async saveConfig(config: Partial<Config>): Promise<void> {
        const existingConfig = await this.loadConfig();
        const mergedConfig: Config = {
            ...existingConfig,
            ...config,
            scanOptions: {
                ...existingConfig.scanOptions,
                ...(config.scanOptions ?? {})
            }
        };

        try {
            const jsonContent = JSON.stringify(mergedConfig, null, 2);
            await fs.promises.writeFile(this.configPath, jsonContent, 'utf-8');
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOSPC') {
                throw new Error('Cannot save config. Disk full');
            }
            if (err.code === 'EACCES') {
                throw new Error('Cannot save config. Permission denied');
            }
            throw new Error(`Failed to save config: ${err.message}`);
        }
    }

    /**
     * Load configuration from config.json file.
     * Returns defaults if file is missing or corrupted.
     * @returns The configuration object with all fields populated
     */
    async loadConfig(): Promise<Config> {
        try {
            const content = await fs.promises.readFile(this.configPath, 'utf-8');
            const parsed = JSON.parse(content);

            if (!this.validateConfig(parsed)) {
                console.warn('Invalid config.json structure, using defaults');
                return { ...DEFAULT_CONFIG };
            }

            // Merge with defaults to fill in any missing fields
            return {
                apiEndpoint: parsed.apiEndpoint ?? DEFAULT_CONFIG.apiEndpoint,
                autoSync: typeof parsed.autoSync === 'boolean' ? parsed.autoSync : DEFAULT_CONFIG.autoSync,
                scanOptions: {
                    includePatterns: Array.isArray(parsed.scanOptions?.includePatterns)
                        ? parsed.scanOptions.includePatterns
                        : DEFAULT_CONFIG.scanOptions.includePatterns,
                    excludePatterns: Array.isArray(parsed.scanOptions?.excludePatterns)
                        ? parsed.scanOptions.excludePatterns
                        : DEFAULT_CONFIG.scanOptions.excludePatterns
                }
            };
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
                // File doesn't exist, return defaults
                return { ...DEFAULT_CONFIG };
            }
            if (error instanceof SyntaxError) {
                console.warn('Corrupted config.json, using defaults');
                return { ...DEFAULT_CONFIG };
            }
            // For other errors, return defaults but log warning
            console.warn(`Failed to load config: ${err.message}, using defaults`);
            return { ...DEFAULT_CONFIG };
        }
    }

    /**
     * Validate config structure.
     * @param config - The config object to validate
     * @returns true if valid, false otherwise
     */
    private validateConfig(config: unknown): config is Partial<Config> {
        if (typeof config !== 'object' || config === null) {
            return false;
        }

        const c = config as Record<string, unknown>;

        // apiEndpoint should be a string if present
        if (c.apiEndpoint !== undefined && typeof c.apiEndpoint !== 'string') {
            return false;
        }

        // autoSync should be a boolean if present
        if (c.autoSync !== undefined && typeof c.autoSync !== 'boolean') {
            return false;
        }

        // scanOptions validation if present
        if (c.scanOptions !== undefined) {
            if (typeof c.scanOptions !== 'object' || c.scanOptions === null) {
                return false;
            }
            const scanOpts = c.scanOptions as Record<string, unknown>;
            if (scanOpts.includePatterns !== undefined && !Array.isArray(scanOpts.includePatterns)) {
                return false;
            }
            if (scanOpts.excludePatterns !== undefined && !Array.isArray(scanOpts.excludePatterns)) {
                return false;
            }
        }

        return true;
    }
}
