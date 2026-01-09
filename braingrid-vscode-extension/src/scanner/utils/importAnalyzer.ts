/**
 * Import statement analysis using ts-morph
 */
import { Project, SourceFile, SyntaxKind, CallExpression } from 'ts-morph';

/**
 * Information about a single import statement
 */
export interface ImportInfo {
    /** The import path (e.g., './utils', '@/lib/db') */
    source: string;
    /** true if starts with . or .. */
    isRelative: boolean;
    /** true if from node_modules */
    isExternal: boolean;
    /** Named imports or ['default'] for default import */
    importedNames: string[];
    /** File containing this import */
    filePath: string;
}

/**
 * Dependencies of a single file
 */
export interface FileDependency {
    filePath: string;
    imports: ImportInfo[];
    exports: string[];
}

/**
 * Analyze import statements in TypeScript/JavaScript files.
 */
export class ImportAnalyzer {
    private project: Project;

    constructor() {
        this.project = new Project({
            compilerOptions: { strict: true },
            skipAddingFilesFromTsConfig: true
        });
    }

    /**
     * Analyze imports and exports in a single file.
     * @param filePath - Absolute path to the TypeScript/JavaScript file
     * @returns File dependency information
     */
    analyzeFile(filePath: string): FileDependency {
        const sourceFile = this.project.addSourceFileAtPath(filePath);

        const imports = this.extractImports(sourceFile, filePath);
        const exports = this.extractExports(sourceFile);

        return { filePath, imports, exports };
    }

    /**
     * Extract import information from a source file.
     */
    private extractImports(sourceFile: SourceFile, filePath: string): ImportInfo[] {
        const imports: ImportInfo[] = [];

        for (const importDecl of sourceFile.getImportDeclarations()) {
            const moduleSpecifier = importDecl.getModuleSpecifierValue();
            const isRelative = moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('..');
            const isExternal = !isRelative && !moduleSpecifier.startsWith('@/') && !moduleSpecifier.startsWith('~');

            const importedNames: string[] = [];

            // Default import
            const defaultImport = importDecl.getDefaultImport();
            if (defaultImport) {
                importedNames.push('default');
            }

            // Named imports
            for (const namedImport of importDecl.getNamedImports()) {
                importedNames.push(namedImport.getName());
            }

            // Namespace import (import * as X)
            const namespaceImport = importDecl.getNamespaceImport();
            if (namespaceImport) {
                importedNames.push('*');
            }

            // Side-effect import (import 'module')
            if (importedNames.length === 0) {
                importedNames.push('side-effect');
            }

            imports.push({
                source: moduleSpecifier,
                isRelative,
                isExternal,
                importedNames,
                filePath
            });
        }

        // Also check for require() calls
        for (const callExpr of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression) as CallExpression[]) {
            const expression = callExpr.getExpression();
            if (expression.getText() === 'require') {
                const args = callExpr.getArguments();
                if (args.length > 0) {
                    const moduleSpecifier = args[0].getText().replace(/['"]/g, '');
                    const isRelative = moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('..');
                    const isExternal = !isRelative && !moduleSpecifier.startsWith('@/') && !moduleSpecifier.startsWith('~');

                    imports.push({
                        source: moduleSpecifier,
                        isRelative,
                        isExternal,
                        importedNames: ['require'],
                        filePath
                    });
                }
            }
        }

        return imports;
    }

    /**
     * Extract export names from a source file.
     */
    private extractExports(sourceFile: SourceFile): string[] {
        const exports: string[] = [];

        // Named exports from export declarations
        for (const exportDecl of sourceFile.getExportDeclarations()) {
            for (const namedExport of exportDecl.getNamedExports()) {
                exports.push(namedExport.getName());
            }
        }

        // Exported functions
        for (const func of sourceFile.getFunctions()) {
            if (func.isExported()) {
                const name = func.getName();
                if (name) exports.push(name);
            }
        }

        // Exported classes
        for (const cls of sourceFile.getClasses()) {
            if (cls.isExported()) {
                const name = cls.getName();
                if (name) exports.push(name);
            }
        }

        // Exported interfaces
        for (const iface of sourceFile.getInterfaces()) {
            if (iface.isExported()) {
                exports.push(iface.getName());
            }
        }

        // Exported type aliases
        for (const typeAlias of sourceFile.getTypeAliases()) {
            if (typeAlias.isExported()) {
                exports.push(typeAlias.getName());
            }
        }

        // Exported enums
        for (const enumDecl of sourceFile.getEnums()) {
            if (enumDecl.isExported()) {
                exports.push(enumDecl.getName());
            }
        }

        // Exported variables
        for (const varStmt of sourceFile.getVariableStatements()) {
            if (varStmt.isExported()) {
                for (const decl of varStmt.getDeclarations()) {
                    exports.push(decl.getName());
                }
            }
        }

        // Check for default export
        const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
        if (defaultExportSymbol) {
            exports.push('default');
        }

        return exports;
    }
}
