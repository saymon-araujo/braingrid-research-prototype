/**
 * Prisma schema parsing using regex patterns
 */
import { readFileSafe } from './fileSystem';
import { EntityDefinition, FieldDefinition, EnumDefinition } from './typeScriptParser';

/**
 * Prisma primitive types
 */
const PRISMA_PRIMITIVES = new Set([
    'String', 'Int', 'Float', 'Boolean', 'DateTime',
    'Json', 'Bytes', 'BigInt', 'Decimal'
]);

/**
 * Map Prisma types to TypeScript equivalents
 */
const PRISMA_TYPE_MAP: Record<string, string> = {
    'String': 'string',
    'Int': 'number',
    'Float': 'number',
    'Boolean': 'boolean',
    'DateTime': 'Date',
    'Json': 'object',
    'Bytes': 'Buffer',
    'BigInt': 'bigint',
    'Decimal': 'number'
};

/**
 * Parse a Prisma schema file and extract models and enums.
 * @param schemaPath - Path to the schema.prisma file
 * @returns Parsed entities and enums, or null if file doesn't exist
 */
export async function parsePrismaSchema(schemaPath: string): Promise<{
    entities: EntityDefinition[];
    enums: EnumDefinition[];
} | null> {
    const content = await readFileSafe(schemaPath, 1024 * 1024);
    if (!content) return null;

    const entities: EntityDefinition[] = [];
    const enums: EnumDefinition[] = [];

    // Parse models
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match;

    while ((match = modelRegex.exec(content)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];
        const fields = parsePrismaFields(modelBody);

        entities.push({
            name: modelName,
            fields,
            source: 'prisma',
            filePath: schemaPath
        });
    }

    // Parse enums
    const enumRegex = /enum\s+(\w+)\s*\{([^}]+)\}/g;

    while ((match = enumRegex.exec(content)) !== null) {
        const enumName = match[1];
        const enumBody = match[2];
        const values = enumBody
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('//'));

        enums.push({
            name: enumName,
            values,
            source: 'prisma'
        });
    }

    return { entities, enums };
}

/**
 * Parse fields from a Prisma model body.
 */
function parsePrismaFields(modelBody: string): FieldDefinition[] {
    const fields: FieldDefinition[] = [];
    const lines = modelBody.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines, comments, and block attributes
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) {
            continue;
        }

        // Match field pattern: fieldName Type[]? @directives
        // Examples:
        //   id        String   @id @default(uuid())
        //   name      String?
        //   posts     Post[]
        //   author    User     @relation(...)
        const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
        if (!fieldMatch) continue;

        const [, name, type, isArrayMarker, optionalMarker] = fieldMatch;

        // Determine if this is a relation
        const hasRelationDirective = trimmed.includes('@relation');
        const isPrimitive = PRISMA_PRIMITIVES.has(type);
        const isRelation = hasRelationDirective || (!isPrimitive && /^[A-Z]/.test(type));

        fields.push({
            name,
            type: mapPrismaType(type),
            optional: !!optionalMarker,
            isArray: !!isArrayMarker,
            isRelation
        });
    }

    return fields;
}

/**
 * Map a Prisma type to its TypeScript equivalent.
 */
function mapPrismaType(prismaType: string): string {
    return PRISMA_TYPE_MAP[prismaType] || prismaType;
}
