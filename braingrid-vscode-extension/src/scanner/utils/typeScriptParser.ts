/**
 * TypeScript interface and type parsing using ts-morph
 */
import { Project, InterfaceDeclaration, TypeAliasDeclaration, EnumDeclaration } from 'ts-morph';

/**
 * Definition of a field within an entity
 */
export interface FieldDefinition {
    name: string;
    type: string;
    optional: boolean;
    isArray: boolean;
    isRelation: boolean;
}

/**
 * Definition of an entity (interface, type, or model)
 */
export interface EntityDefinition {
    name: string;
    fields: FieldDefinition[];
    source: 'typescript' | 'prisma';
    filePath?: string;
}

/**
 * Definition of an enum
 */
export interface EnumDefinition {
    name: string;
    values: string[];
    source: 'typescript' | 'prisma';
}

/**
 * Primitive TypeScript types that are not relations
 */
const PRIMITIVE_TYPES = new Set([
    'string', 'number', 'boolean', 'Date', 'null', 'undefined',
    'any', 'unknown', 'void', 'never', 'object', 'bigint', 'symbol'
]);

/**
 * Parse TypeScript files for interfaces, types, and enums using ts-morph.
 */
export class TypeScriptParser {
    private project: Project;
    private knownEntities: Set<string> = new Set();

    constructor() {
        this.project = new Project({
            compilerOptions: { strict: true },
            skipAddingFilesFromTsConfig: true
        });
    }

    /**
     * Parse a TypeScript file and extract entities and enums.
     * @param filePath - Absolute path to the TypeScript file
     * @returns Extracted entities and enums
     */
    parseFile(filePath: string): {
        entities: EntityDefinition[];
        enums: EnumDefinition[];
    } {
        const sourceFile = this.project.addSourceFileAtPath(filePath);

        const entities: EntityDefinition[] = [];
        const enums: EnumDefinition[] = [];

        // Parse interfaces
        for (const iface of sourceFile.getInterfaces()) {
            const entity = this.parseInterface(iface, filePath);
            if (entity) {
                entities.push(entity);
                this.knownEntities.add(entity.name);
            }
        }

        // Parse type aliases (object types only)
        for (const typeAlias of sourceFile.getTypeAliases()) {
            const entity = this.parseTypeAlias(typeAlias, filePath);
            if (entity) {
                entities.push(entity);
                this.knownEntities.add(entity.name);
            }
        }

        // Parse enums
        for (const enumDecl of sourceFile.getEnums()) {
            enums.push(this.parseEnum(enumDecl));
        }

        return { entities, enums };
    }

    /**
     * Parse an interface declaration into an entity definition.
     */
    private parseInterface(iface: InterfaceDeclaration, filePath: string): EntityDefinition | null {
        const fields: FieldDefinition[] = [];

        for (const prop of iface.getProperties()) {
            const propType = prop.getType();
            const typeText = propType.getText();

            fields.push({
                name: prop.getName(),
                type: this.simplifyType(typeText),
                optional: prop.hasQuestionToken(),
                isArray: propType.isArray(),
                isRelation: this.isRelationType(typeText)
            });
        }

        return {
            name: iface.getName(),
            fields,
            source: 'typescript',
            filePath
        };
    }

    /**
     * Parse a type alias declaration into an entity definition.
     * Only parses object-like type aliases.
     */
    private parseTypeAlias(typeAlias: TypeAliasDeclaration, filePath: string): EntityDefinition | null {
        const typeNode = typeAlias.getTypeNode();
        if (!typeNode) return null;

        // Skip non-object types (unions of primitives, simple types)
        const typeText = typeNode.getText();
        if (!typeText.includes('{')) {
            return null;
        }

        const fields: FieldDefinition[] = [];
        const type = typeAlias.getType();

        for (const prop of type.getProperties()) {
            const propType = prop.getTypeAtLocation(typeAlias);
            const propTypeText = propType.getText();

            fields.push({
                name: prop.getName(),
                type: this.simplifyType(propTypeText),
                optional: prop.isOptional(),
                isArray: propType.isArray(),
                isRelation: this.isRelationType(propTypeText)
            });
        }

        if (fields.length === 0) return null;

        return {
            name: typeAlias.getName(),
            fields,
            source: 'typescript',
            filePath
        };
    }

    /**
     * Parse an enum declaration into an enum definition.
     */
    private parseEnum(enumDecl: EnumDeclaration): EnumDefinition {
        return {
            name: enumDecl.getName(),
            values: enumDecl.getMembers().map(m => m.getName()),
            source: 'typescript'
        };
    }

    /**
     * Simplify a type text by removing imports and array brackets.
     */
    private simplifyType(typeText: string): string {
        return typeText
            .replace(/import\([^)]+\)\./g, '') // Remove import() statements
            .replace(/\[\]$/g, '') // Remove trailing array brackets
            .trim();
    }

    /**
     * Check if a type references another entity (not a primitive).
     */
    private isRelationType(typeText: string): boolean {
        const simplified = this.simplifyType(typeText)
            .replace(/\[\]/g, '') // Remove array indicators
            .replace(/\s*\|\s*/g, ' ') // Split unions
            .split(' ')
            .map(t => t.trim())
            .filter(Boolean);

        return simplified.some(t => {
            // Skip primitives
            if (PRIMITIVE_TYPES.has(t.toLowerCase())) return false;
            // Check if starts with uppercase (likely a custom type/entity)
            return /^[A-Z]/.test(t);
        });
    }

    /**
     * Update known entities for relationship detection.
     * @param entities - Array of entity names
     */
    setKnownEntities(entities: string[]): void {
        this.knownEntities = new Set(entities);
    }

    /**
     * Get all known entity names.
     */
    getKnownEntities(): string[] {
        return Array.from(this.knownEntities);
    }
}
