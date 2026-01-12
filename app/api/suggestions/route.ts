import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * Generate project suggestions based on codebase context.
 * Uses Claude Haiku for fast, cheap generation.
 */
export async function POST(req: NextRequest) {
  try {
    const { codebaseContext } = (await req.json()) as {
      codebaseContext?: string;
    };

    // If no codebase context, return generic suggestions
    if (!codebaseContext) {
      return NextResponse.json({
        suggestions: [
          'Build a todo app with user authentication',
          'Create an API for managing inventory',
          'Design a real-time chat application'
        ],
        fromCodebase: false
      });
    }

    const prompt = `Based on this codebase analysis, suggest 3 relevant feature ideas or improvements that would make sense for this project.

## Codebase Context
${codebaseContext}

## Instructions
- Generate exactly 3 short, actionable suggestions (max 10 words each)
- Make suggestions specific to this codebase's technology and domain
- Focus on features, improvements, or integrations that fit the existing architecture
- Each suggestion should be a complete, actionable project idea

Respond with ONLY a JSON array of 3 strings, nothing else. Example:
["Add dark mode toggle to settings", "Implement user activity logging", "Create admin dashboard for analytics"]`;

    const result = await generateText({
      model: anthropic('claude-3-5-haiku-20241022'),
      prompt,
      maxTokens: 200,
    });

    // Parse the JSON array from the response
    const text = result.text.trim();
    let suggestions: string[];

    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions) || suggestions.length !== 3) {
        throw new Error('Invalid suggestions format');
      }
    } catch {
      // Fallback if parsing fails
      console.error('Failed to parse suggestions:', text);
      suggestions = [
        'Add a new feature to the project',
        'Improve existing functionality',
        'Create tests for core components'
      ];
    }

    return NextResponse.json({
      suggestions,
      fromCodebase: true
    });
  } catch (error) {
    console.error('Suggestions API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
