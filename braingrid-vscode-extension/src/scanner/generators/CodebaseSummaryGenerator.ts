/**
 * Codebase Summary Generator
 * Extracts high-level project characteristics for AI context.
 */
import * as path from 'path';
import { ArtifactResult, ScanOptions, DEFAULT_SCAN_OPTIONS } from '../types';
import { readFileSafe, listDirectory, isDirectory, pathExists } from '../utils/fileSystem';
import { parseGitignore, isIgnored } from '../utils/gitignoreParser';
import { parseAllDependencies, DependencyInfo } from '../utils/dependencyParser';

/**
 * Structure of the generated codebase summary
 */
export interface CodebaseSummary {
    projectName?: string;
    purpose?: string;
    primaryLanguage: string;
    languages: Record<string, number>; // language -> percentage
    frameworks: string[];
    apiIntegrations: string[];
    buildTools: string[];
    dependencyCount: number;
}

/**
 * Framework detection patterns - maps framework name to dependency indicators
 */
const FRAMEWORK_PATTERNS: Record<string, string[]> = {
    'Next.js': ['next'],
    'Remix': ['@remix-run/react', '@remix-run/node'],
    'React': ['react', 'react-dom'],
    'Vue': ['vue'],
    'Angular': ['@angular/core'],
    'Svelte': ['svelte'],
    'SvelteKit': ['@sveltejs/kit'],
    'Express': ['express'],
    'Fastify': ['fastify'],
    'NestJS': ['@nestjs/core'],
    'Hono': ['hono'],
    'Prisma': ['@prisma/client', 'prisma'],
    'Drizzle': ['drizzle-orm'],
    'tRPC': ['@trpc/server', '@trpc/client'],
    'Django': ['django', 'Django'],
    'Flask': ['flask', 'Flask'],
    'FastAPI': ['fastapi'],
    'Gin': ['github.com/gin-gonic/gin'],
    'Echo': ['github.com/labstack/echo'],
    'Actix': ['actix-web'],
    'Axum': ['axum'],
    'Tokio': ['tokio']
};

/**
 * API integration detection patterns
 */
const API_PATTERNS: Record<string, string[]> = {
    'Anthropic': ['@anthropic-ai/sdk', '@ai-sdk/anthropic', 'anthropic'],
    'OpenAI': ['openai', '@ai-sdk/openai'],
    'Vercel AI': ['ai', '@ai-sdk/'],
    'Stripe': ['stripe'],
    'AWS': ['aws-sdk', '@aws-sdk/'],
    'Google Cloud': ['@google-cloud/'],
    'Firebase': ['firebase', 'firebase-admin'],
    'Supabase': ['@supabase/supabase-js'],
    'Twilio': ['twilio'],
    'SendGrid': ['@sendgrid/mail'],
    'Resend': ['resend'],
    'Clerk': ['@clerk/'],
    'Auth0': ['@auth0/']
};

/**
 * Build tool detection by config file presence
 */
const BUILD_TOOL_FILES: Record<string, string> = {
    'vite.config.ts': 'Vite',
    'vite.config.js': 'Vite',
    'vite.config.mjs': 'Vite',
    'webpack.config.js': 'Webpack',
    'webpack.config.ts': 'Webpack',
    'rollup.config.js': 'Rollup',
    'rollup.config.ts': 'Rollup',
    'rollup.config.mjs': 'Rollup',
    'tsconfig.json': 'TypeScript',
    'jsconfig.json': 'JavaScript',
    'turbo.json': 'Turborepo',
    'nx.json': 'Nx',
    'esbuild.config.js': 'esbuild',
    'esbuild.config.mjs': 'esbuild',
    'Makefile': 'Make',
    'CMakeLists.txt': 'CMake',
    'build.gradle': 'Gradle',
    'pom.xml': 'Maven',
    'Cargo.toml': 'Cargo',
    'go.mod': 'Go Modules'
};

/**
 * Language detection by file extension
 */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.mts': 'TypeScript',
    '.cts': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.mjs': 'JavaScript',
    '.cjs': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.kt': 'Kotlin',
    '.kts': 'Kotlin',
    '.swift': 'Swift',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.cs': 'C#',
    '.cpp': 'C++',
    '.cc': 'C++',
    '.cxx': 'C++',
    '.c': 'C',
    '.h': 'C/C++',
    '.hpp': 'C++',
    '.scala': 'Scala',
    '.clj': 'Clojure',
    '.ex': 'Elixir',
    '.exs': 'Elixir',
    '.erl': 'Erlang',
    '.hs': 'Haskell',
    '.ml': 'OCaml',
    '.fs': 'F#',
    '.dart': 'Dart',
    '.lua': 'Lua',
    '.r': 'R',
    '.R': 'R',
    '.jl': 'Julia'
};

/**
 * Generates codebase summary with tech stack detection.
 */
export class CodebaseSummaryGenerator {
    private readonly workspacePath: string;
    private readonly options: Required<ScanOptions>;
    private gitignorePatterns: string[] = [];
    private errorCount = 0;
    private fileCount = 0;

    /**
     * Create a new CodebaseSummaryGenerator.
     * @param workspacePath - Root path of the workspace to scan
     * @param options - Scan configuration options
     */
    constructor(workspacePath: string, options?: ScanOptions) {
        this.workspacePath = workspacePath;
        this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    }

    /**
     * Generate the codebase summary artifact.
     * @returns ArtifactResult with JSON content
     */
    async generate(): Promise<ArtifactResult> {
        // Reset state for fresh generation
        this.errorCount = 0;
        this.fileCount = 0;

        // Parse gitignore
        this.gitignorePatterns = await parseGitignore(this.workspacePath);

        // Gather all information in parallel
        const [dependencies, languages, buildTools, purpose] = await Promise.all([
            this.parseDependencies(),
            this.detectLanguages(),
            this.detectBuildTools(),
            this.extractPurpose()
        ]);

        const allDeps = [...dependencies.dependencies, ...dependencies.devDependencies];
        const frameworks = this.detectFrameworks(allDeps);
        const apiIntegrations = this.detectAPIIntegrations(allDeps);

        // Determine primary language
        const primaryLanguage = this.getPrimaryLanguage(languages);

        const summary: CodebaseSummary = {
            projectName: dependencies.name,
            purpose,
            primaryLanguage,
            languages,
            frameworks,
            apiIntegrations,
            buildTools,
            dependencyCount: allDeps.length
        };

        return {
            type: 'summary',
            content: JSON.stringify(summary, null, 2),
            generatedAt: new Date().toISOString(),
            fileCount: this.fileCount,
            errorCount: this.errorCount
        };
    }

    /**
     * Parse dependencies from all supported package managers.
     */
    private async parseDependencies(): Promise<DependencyInfo> {
        try {
            return await parseAllDependencies(this.workspacePath);
        } catch {
            this.errorCount++;
            return { dependencies: [], devDependencies: [] };
        }
    }

    /**
     * Detect programming languages by counting file extensions.
     */
    private async detectLanguages(): Promise<Record<string, number>> {
        const counts: Record<string, number> = {};
        let totalCodeFiles = 0;

        await this.traverseForLanguages(this.workspacePath, 0, counts, () => {
            totalCodeFiles++;
        });

        // Handle edge case: no code files found
        if (totalCodeFiles === 0) {
            return {};
        }

        // Convert to percentages
        const percentages: Record<string, number> = {};
        for (const [lang, count] of Object.entries(counts)) {
            percentages[lang] = Math.round((count / totalCodeFiles) * 100);
        }

        return percentages;
    }

    /**
     * Recursively traverse directories counting language files.
     */
    private async traverseForLanguages(
        dirPath: string,
        depth: number,
        counts: Record<string, number>,
        incrementTotal: () => void
    ): Promise<void> {
        if (depth >= this.options.maxDepth) return;

        const entries = await listDirectory(dirPath);

        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            const relativePath = path.relative(this.workspacePath, entryPath);
            const isDir = await isDirectory(entryPath);

            // Check exclusions
            if (this.options.excludePatterns.includes(entry)) continue;
            if (isIgnored(relativePath, this.gitignorePatterns, isDir)) continue;

            if (isDir) {
                await this.traverseForLanguages(entryPath, depth + 1, counts, incrementTotal);
            } else {
                this.fileCount++;
                const ext = path.extname(entry).toLowerCase();
                const language = LANGUAGE_EXTENSIONS[ext];
                if (language) {
                    counts[language] = (counts[language] || 0) + 1;
                    incrementTotal();
                }
            }
        }
    }

    /**
     * Determine the primary language based on file count percentages.
     */
    private getPrimaryLanguage(languages: Record<string, number>): string {
        let maxLang = 'Unknown';
        let maxPercent = 0;

        for (const [lang, percent] of Object.entries(languages)) {
            if (percent > maxPercent) {
                maxPercent = percent;
                maxLang = lang;
            }
        }

        return maxLang;
    }

    /**
     * Detect frameworks from dependency list.
     */
    private detectFrameworks(dependencies: string[]): string[] {
        const detected: string[] = [];
        const depLower = dependencies.map(d => d.toLowerCase());

        for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
            for (const pattern of patterns) {
                const patternLower = pattern.toLowerCase();
                // Check exact match or prefix match
                if (depLower.includes(patternLower) ||
                    depLower.some(d => d.startsWith(patternLower))) {
                    detected.push(framework);
                    break;
                }
            }
        }

        return detected;
    }

    /**
     * Detect API integrations from dependency list.
     */
    private detectAPIIntegrations(dependencies: string[]): string[] {
        const detected: string[] = [];
        const depLower = dependencies.map(d => d.toLowerCase());

        for (const [api, patterns] of Object.entries(API_PATTERNS)) {
            for (const pattern of patterns) {
                const patternLower = pattern.toLowerCase();
                // Check exact match or prefix/contains match
                if (depLower.includes(patternLower) ||
                    depLower.some(d => d.startsWith(patternLower) || d.includes(patternLower))) {
                    detected.push(api);
                    break;
                }
            }
        }

        return detected;
    }

    /**
     * Detect build tools by checking for config file presence.
     */
    private async detectBuildTools(): Promise<string[]> {
        const detected: string[] = [];

        for (const [filename, tool] of Object.entries(BUILD_TOOL_FILES)) {
            const filePath = path.join(this.workspacePath, filename);
            if (await pathExists(filePath)) {
                if (!detected.includes(tool)) {
                    detected.push(tool);
                }
            }
        }

        return detected;
    }

    /**
     * Extract project purpose from README file.
     */
    private async extractPurpose(): Promise<string | undefined> {
        const readmePaths = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'README'];

        for (const filename of readmePaths) {
            const filePath = path.join(this.workspacePath, filename);
            const content = await readFileSafe(filePath, 10 * 1024); // 10KB limit

            if (content) {
                // Clean up markdown and extract first 500 characters
                const cleaned = content
                    .replace(/^#.*$/gm, '') // Remove headers
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
                    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Remove images
                    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
                    .replace(/`[^`]+`/g, '') // Remove inline code
                    .replace(/[*_~]/g, '') // Remove formatting
                    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
                    .trim();

                const purpose = cleaned.slice(0, 500).trim();
                if (purpose.length > 0) {
                    return purpose;
                }
            }
        }

        return undefined;
    }
}
