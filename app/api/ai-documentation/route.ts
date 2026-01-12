import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import {
  getDocumentationPrompt,
  isValidArtifactType,
  type DocumentationArtifactType,
} from '@/lib/documentation-prompts';

export const maxDuration = 120; // 2 minutes for complex documentation generation

interface DocumentationRequest {
  artifactType: string;
  jsonContent: string;
  projectName: string;
}

interface DocumentationResponse {
  markdown: string;
  artifactType: DocumentationArtifactType;
  generatedAt: string;
}

interface ErrorResponse {
  error: string;
  details?: string;
}

/**
 * POST /api/ai-documentation
 *
 * Generates AI-powered markdown documentation from raw JSON artifacts.
 * Used by the BrainGrid VS Code extension to transform scanner output
 * into human-readable documentation.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<DocumentationResponse | ErrorResponse>> {
  try {
    const body = (await request.json()) as DocumentationRequest;
    const { artifactType, jsonContent, projectName } = body;

    // Validate artifact type
    if (!artifactType || !isValidArtifactType(artifactType)) {
      return NextResponse.json(
        {
          error: 'Invalid artifact type',
          details: `Expected one of: codebaseSummary, dataModel, architecture, workflows. Got: ${artifactType}`,
        },
        { status: 400 }
      );
    }

    // Validate JSON content
    if (!jsonContent || typeof jsonContent !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid jsonContent' },
        { status: 400 }
      );
    }

    // Validate project name
    if (!projectName || typeof projectName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid projectName' },
        { status: 400 }
      );
    }

    // Truncate very large JSON content to avoid token limits
    const maxJsonLength = 100000; // ~100KB
    const truncatedContent =
      jsonContent.length > maxJsonLength
        ? jsonContent.substring(0, maxJsonLength) + '\n\n[... truncated for length ...]'
        : jsonContent;

    // Get the appropriate system prompt
    const systemPrompt = getDocumentationPrompt(artifactType);

    // Build the user message
    const userMessage = `Generate comprehensive markdown documentation for the following project.

Project Name: ${projectName}

JSON Data:
\`\`\`json
${truncatedContent}
\`\`\`

Generate the markdown documentation following the format specified in your instructions. Be thorough but concise.`;

    console.log(
      `[ai-documentation] Generating ${artifactType} documentation for "${projectName}"...`
    );

    // Generate documentation using Claude
    const result = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 8192,
      maxRetries: 5,
    });

    const markdown = result.text;

    if (!markdown || markdown.trim().length === 0) {
      console.error('[ai-documentation] Empty response from Claude');
      return NextResponse.json(
        { error: 'AI generated empty response' },
        { status: 500 }
      );
    }

    console.log(
      `[ai-documentation] Successfully generated ${artifactType} documentation (${markdown.length} chars)`
    );

    return NextResponse.json({
      markdown,
      artifactType,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ai-documentation] Error:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        error: 'Failed to generate documentation',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai-documentation
 *
 * Returns supported artifact types and API information.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    name: 'AI Documentation Generation API',
    version: '1.0.0',
    supportedArtifactTypes: [
      'codebaseSummary',
      'dataModel',
      'architecture',
      'workflows',
    ],
    usage: {
      method: 'POST',
      body: {
        artifactType: 'string - one of supportedArtifactTypes',
        jsonContent: 'string - JSON content to transform into documentation',
        projectName: 'string - name of the project being documented',
      },
    },
  });
}
