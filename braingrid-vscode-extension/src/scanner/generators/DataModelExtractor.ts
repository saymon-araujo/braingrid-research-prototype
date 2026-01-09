/**
 * Data Model Extractor
 * Extracts data schemas and relationships from TypeScript and Prisma.
 */
import * as path from 'path';
import { ArtifactResult, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types';
import { listDirectory, isDirectory, pathExists } from '../utils/fileSystem';
import { parseGitignore, isIgnored } from '../utils/gitignoreParser';
import { TypeScriptParser, EntityDefinition, EnumDefinition } from '../utils/typeScriptParser';
import { parsePrismaSchema } from '../utils/prismaParser';

/**
 * Relationship between entities
 */
export interface Relationship {
    source: string;
    target: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
    sourceField: string;
}

/**
 * Complete data model structure
 */
export interface DataModel {
    entities: EntityDefinition[];
    relationships: Relationship[];
    enums: EnumDefinition[];
}

/**
 * Directories commonly containing data models
 */
const MODEL_DIRECTORIES = [
    'models',
    'entities',
    'types',
    'schema',
    'schemas',
    'src/models',
    'src/entities',
    'src/types',
    'src/schema',
    'src/schemas',
    'lib/models',
    'lib/entities',
    'lib/types',
    'app/models',
    'app/entities'
];

/**
 * Extracts data model information from TypeScript and Prisma files.
 */
export class DataModelExtractor {
    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private gitignorePatterns: string[] = [];
    private errorCount = 0;
    private fileCount = 0;

    /**
     * Create a new DataModelExtractor.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    }

    /**
     * Generate the data model artifact.
     * @returns ArtifactResult with JSON content
     */
    async generate(): Promise<ArtifactResult> {
        // Reset state for fresh generation
        this.errorCount = 0;
        this.fileCount = 0;

        // Parse gitignore
        this.gitignorePatterns = await parseGitignore(this.workspacePath);

        // Gather all models in parallel
        const [tsResult, prismaResult] = await Promise.all([
            this.scanTypeScriptModels(),
            this.scanPrismaSchema()
        ]);

        // Merge entities (Prisma takes precedence for duplicates)
        const entityMap = new Map<string, EntityDefinition>();
        for (const entity of tsResult.entities) {
            entityMap.set(entity.name, entity);
        }
        for (const entity of prismaResult.entities) {
            entityMap.set(entity.name, entity); // Override TS with Prisma
        }

        const entities = Array.from(entityMap.values());

        // Deduplicate enums by name (Prisma takes precedence)
        const enumMap = new Map<string, EnumDefinition>();
        for (const enumDef of tsResult.enums) {
            enumMap.set(enumDef.name, enumDef);
        }
        for (const enumDef of prismaResult.enums) {
            enumMap.set(enumDef.name, enumDef);
        }
        const enums = Array.from(enumMap.values());

        // Detect relationships
        const relationships = this.detectRelationships(entities);

        const dataModel: DataModel = {
            entities,
            relationships,
            enums
        };

        return {
            type: 'dataModel',
            content: JSON.stringify(dataModel, null, 2),
            generatedAt: new Date().toISOString(),
            fileCount: this.fileCount,
            errorCount: this.errorCount
        };
    }

    /**
     * Scan TypeScript files in common model directories.
     */
    private async scanTypeScriptModels(): Promise<{
        entities: EntityDefinition[];
        enums: EnumDefinition[];
    }> {
        const parser = new TypeScriptParser();
        const entities: EntityDefinition[] = [];
        const enums: EnumDefinition[] = [];

        for (const modelDir of MODEL_DIRECTORIES) {
            const dirPath = path.join(this.workspacePath, modelDir);
            if (await pathExists(dirPath)) {
                await this.scanDirectory(dirPath, parser, entities, enums);
            }
        }

        return { entities, enums };
    }

    /**
     * Recursively scan a directory for TypeScript files.
     */
    private async scanDirectory(
        dirPath: string,
        parser: TypeScriptParser,
        entities: EntityDefinition[],
        enums: EnumDefinition[]
    ): Promise<void> {
        const entries = await listDirectory(dirPath);

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.options.excludePatterns.includes(entry)) continue;
            if (isIgnored(relativePath, this.gitignorePatterns, isDir)) continue;

            if (isDir) {
                await this.scanDirectory(entryPath, parser, entities, enums);
            } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
                this.fileCount++;
                try {
                    const result = parser.parseFile(entryPath);
                    entities.push(...result.entities);
                    enums.push(...result.enums);
                } catch {
                    this.errorCount++;
                }
            }
        }
    }

    /**
     * Scan for Prisma schema file.
     */
    private async scanPrismaSchema(): Promise<{
        entities: EntityDefinition[];
        enums: EnumDefinition[];
    }> {
        const schemaPath = path.join(this.workspacePath, 'prisma', 'schema.prisma');

        if (await pathExists(schemaPath)) {
            this.fileCount++;
            try {
                const result = await parsePrismaSchema(schemaPath);
                if (result) return result;
            } catch {
                this.errorCount++;
            }
        }

        return { entities: [], enums: [] };
    }

    /**
     * Detect relationships between entities based on field types.
     */
    private detectRelationships(entities: EntityDefinition[]): Relationship[] {
        const relationships: Relationship[] = [];
        const entityNames = new Set(entities.map(e => e.name));

        for (const entity of entities) {
            for (const field of entity.fields) {
                if (!field.isRelation) continue;

                // Extract target entity name from type
                const targetName = field.type.replace(/\[\]/g, '').trim();
                if (!entityNames.has(targetName)) continue;

                // Determine relationship type
                let relType: Relationship['type'];

                if (field.isArray) {
                    // Check if target has array back to source (many-to-many)
                    const targetEntity = entities.find(e => e.name === targetName);
                    const hasArrayBack = targetEntity?.fields.some(
                        f => f.type.replace(/\[\]/g, '').trim() === entity.name && f.isArray
                    );
                    relType = hasArrayBack ? 'many-to-many' : 'one-to-many';
                } else {
                    // Check if it's a one-to-one (target has single back reference)
                    const targetEntity = entities.find(e => e.name === targetName);
                    const hasSingleBack = targetEntity?.fields.some(
                        f => f.type.replace(/\[\]/g, '').trim() === entity.name && !f.isArray
                    );
                    relType = hasSingleBack ? 'one-to-one' : 'many-to-one';
                }

                relationships.push({
                    source: entity.name,
                    target: targetName,
                    type: relType,
                    sourceField: field.name
                });
            }
        }

        return relationships;
    }
}
