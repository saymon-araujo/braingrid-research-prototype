import type { ParsedAIResponse, Task } from '@/types';

export function parseAIResponse(content: string): ParsedAIResponse {
  const result: ParsedAIResponse = {
    cleanContent: content,
    shouldGenerate: false,
    requirements: null,
    tasks: null,
  };

  // Check for generation trigger
  if (content.includes('[READY_TO_GENERATE]')) {
    result.shouldGenerate = true;
    result.cleanContent = content.replace('[READY_TO_GENERATE]', '').trim();
  }

  // Extract requirements markdown
  const reqMatch = content.match(
    /\[REQUIREMENTS_START\]([\s\S]*?)\[REQUIREMENTS_END\]/
  );
  if (reqMatch) {
    result.requirements = reqMatch[1].trim();
    result.cleanContent = result.cleanContent
      .replace(/\[REQUIREMENTS_START\][\s\S]*?\[REQUIREMENTS_END\]/, '')
      .trim();
  }

  // Extract tasks JSON
  const tasksMatch = content.match(/\[TASKS_START\]([\s\S]*?)\[TASKS_END\]/);
  if (tasksMatch) {
    try {
      const tasksJson = tasksMatch[1].trim();
      result.tasks = JSON.parse(tasksJson) as Task[];
    } catch (e) {
      console.error('Failed to parse tasks JSON:', e);
      // Try to extract and fix common JSON issues
      try {
        const fixedJson = tasksMatch[1]
          .trim()
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        result.tasks = JSON.parse(fixedJson) as Task[];
      } catch {
        console.error('Failed to parse tasks even after fixing');
      }
    }
    result.cleanContent = result.cleanContent
      .replace(/\[TASKS_START\][\s\S]*?\[TASKS_END\]/, '')
      .trim();
  }

  return result;
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
