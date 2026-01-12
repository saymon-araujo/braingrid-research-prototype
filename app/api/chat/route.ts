import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { getSystemPrompt } from '@/lib/prompts';
import type { ConversationPhase } from '@/types';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, phase, researchContext, codebaseContext } = (await req.json()) as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      phase: ConversationPhase;
      researchContext?: string;
      codebaseContext?: string;
    };

    // Combine codebase and research context into a single context string
    let combinedContext = '';
    if (codebaseContext) {
      combinedContext += `## Existing Codebase Analysis\n${codebaseContext}\n\n`;
    }
    if (researchContext) {
      combinedContext += `## Domain Research\n${researchContext}`;
    }

    const systemPrompt = getSystemPrompt(phase, combinedContext || undefined);

    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      maxTokens: 8000,
      maxRetries: 5,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
