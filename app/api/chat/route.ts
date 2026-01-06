import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { getSystemPrompt } from '@/lib/prompts';
import type { ConversationPhase } from '@/types';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { messages, phase } = (await req.json()) as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      phase: ConversationPhase;
    };

    const systemPrompt = getSystemPrompt(phase);

    const result = streamText({
      model: anthropic('claude-opus-4-5-20251101'),
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      maxTokens: 8000,
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
