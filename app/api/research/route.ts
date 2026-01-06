import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import type { ResearchFinding, ResearchResults } from '@/types';

export const maxDuration = 120; // Research can take longer

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  citations?: string[];
}

export async function POST(req: Request) {
  try {
    const { projectDescription } = (await req.json()) as {
      projectDescription: string;
    };

    if (!projectDescription) {
      return new Response(
        JSON.stringify({ error: 'Project description is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Use Perplexity Sonar to research the domain
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityApiKey) {
      return new Response(
        JSON.stringify({ error: 'PERPLEXITY_API_KEY not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const researchPrompt = `Research the following project idea comprehensively. I need practical, actionable information for building this project.

Project: ${projectDescription}

Please provide:
1. **Key Domain Concepts**: Essential terminology and concepts a developer should understand
2. **Best Practices**: Industry-standard approaches and patterns for this type of project
3. **Common Pitfalls**: Mistakes to avoid and challenges teams typically face
4. **Edge Cases**: Scenarios that are often overlooked but important to handle
5. **Technical Considerations**: Architecture, technology choices, and implementation details

Be specific and practical. Include real examples where helpful.`;

    const perplexityMessages: PerplexityMessage[] = [
      {
        role: 'system',
        content: 'You are a technical research assistant. Provide detailed, practical research findings with citations. Focus on actionable insights for software development projects.'
      },
      {
        role: 'user',
        content: researchPrompt
      }
    ];

    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: perplexityMessages,
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Research API failed', details: errorText }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const perplexityData = (await perplexityResponse.json()) as PerplexityResponse;
    const rawResearch = perplexityData.choices[0]?.message?.content || '';
    const citations = perplexityData.citations || [];

    // Step 2: Use Claude Opus 4.5 to analyze and structure the research
    const reasoningResult = await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      system: `You are a research analyst specializing in software development projects. Your task is to analyze raw research findings and:

1. Extract and categorize key insights
2. Rank findings by relevance to the project
3. Identify gaps that need clarification
4. Suggest clarifying questions based on the research

Output your analysis as valid JSON with this exact structure:
{
  "summary": "2-3 paragraph summary of key findings",
  "findings": [
    {
      "id": "finding-1",
      "category": "concept|best_practice|pitfall|edge_case|technical",
      "title": "Short descriptive title",
      "content": "Detailed explanation",
      "source": "Citation or source if available",
      "relevance": "high|medium|low"
    }
  ],
  "suggestedQuestions": [
    "Question 1 based on research gaps",
    "Question 2 to clarify user needs"
  ]
}

Focus on findings that are actionable for project planning. Prioritize high-relevance items.`,
      prompt: `Project Description: ${projectDescription}

Raw Research Findings:
${rawResearch}

${citations.length > 0 ? `Citations:\n${citations.join('\n')}` : ''}

Analyze this research and output structured JSON.`,
    });

    // Parse Claude's analysis
    let analysis: {
      summary: string;
      findings: ResearchFinding[];
      suggestedQuestions: string[];
    };

    try {
      // Extract JSON from the response (Claude might wrap it in markdown)
      const jsonMatch = reasoningResult.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Claude analysis:', parseError);
      // Fallback: create basic structure from raw research
      analysis = {
        summary: rawResearch.substring(0, 500) + '...',
        findings: [{
          id: 'finding-1',
          category: 'concept',
          title: 'Research Summary',
          content: rawResearch,
          relevance: 'high',
        }],
        suggestedQuestions: [
          'What specific features are most important for your use case?',
          'Are there any technical constraints I should know about?',
        ],
      };
    }

    // Construct the final research results
    const researchResults: ResearchResults = {
      query: projectDescription,
      findings: analysis.findings.map((f, idx) => ({
        ...f,
        id: f.id || `finding-${idx + 1}`,
      })),
      summary: analysis.summary,
      suggestedQuestions: analysis.suggestedQuestions,
      timestamp: new Date(),
    };

    return Response.json(researchResults);
  } catch (error) {
    console.error('Research API error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
