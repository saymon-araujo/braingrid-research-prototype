'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useBrainGrid } from '@/context/braingrid-context';
import { parseAIResponse } from '@/lib/ai-utils';
import { WelcomeDialog } from '@/components/welcome-dialog';
import type { ConversationPhase } from '@/types';

const phaseLabels: Record<ConversationPhase, string> = {
  initial: 'Getting Started',
  researching: 'Researching',
  clarifying: 'Gathering Info',
  generating: 'Generating',
  complete: 'Complete',
};

const phaseVariants: Record<ConversationPhase, 'default' | 'secondary' | 'outline'> = {
  initial: 'secondary',
  researching: 'outline',
  clarifying: 'default',
  generating: 'outline',
  complete: 'secondary',
};

export function ChatPanel() {
  const { state, dispatch } = useBrainGrid();
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm BrainGrid, your AI assistant for project planning. Tell me about the project or feature you'd like to work on, and I'll help you create detailed requirements and actionable tasks.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [localInput, setLocalInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAIResponse = (content: string, skipGeneration = false) => {
    const parsed = parseAIResponse(content);

    // Check if we should trigger generation
    if (parsed.shouldGenerate && state.conversationPhase === 'clarifying' && !skipGeneration) {
      setIsGenerating(true);
      dispatch({ type: 'SET_PHASE', payload: 'generating' });

      // Trigger generation with a slight delay to update the phase
      setTimeout(() => {
        triggerGeneration();
      }, 100);
    }

    // Check if requirements were generated
    if (parsed.requirements) {
      dispatch({ type: 'SET_REQUIREMENTS', payload: parsed.requirements });
    }

    // Check if tasks were generated
    if (parsed.tasks) {
      dispatch({ type: 'SET_TASKS', payload: parsed.tasks });
      dispatch({ type: 'SET_PHASE', payload: 'complete' });
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'tasks' });
      setIsGenerating(false);
    }
  };

  // Trigger research using Perplexity Sonar
  const triggerResearch = async (projectDescription: string): Promise<typeof state.research> => {
    setIsResearching(true);
    dispatch({ type: 'SET_PHASE', payload: 'researching' });

    // Add research status message
    const researchMsgId = `research_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: researchMsgId,
        role: 'assistant',
        content: 'Researching your project domain to provide informed guidance...',
      },
    ]);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectDescription }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Research API error:', errorText);
        throw new Error('Research failed');
      }

      const researchResults = await response.json();
      console.log('Research complete:', researchResults);

      // Store research in context
      dispatch({ type: 'SET_RESEARCH', payload: researchResults });
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'research' });

      // Update message with research summary
      setMessages((prev) =>
        prev.map((m) =>
          m.id === researchMsgId
            ? {
                ...m,
                content: `I've researched your project domain and found ${researchResults.findings?.length || 0} relevant insights. Check the Research tab for details.\n\nBased on my research, let me ask you some informed questions to better understand your needs...`,
              }
            : m
        )
      );

      // Transition to clarifying phase
      dispatch({ type: 'SET_PHASE', payload: 'clarifying' });

      return researchResults;
    } catch (error) {
      console.error('Research error:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === researchMsgId
            ? {
                ...m,
                content: 'Research step skipped. Let me ask you some questions to understand your project better...',
              }
            : m
        )
      );
      // Continue to clarifying even if research fails
      dispatch({ type: 'SET_PHASE', payload: 'clarifying' });
      return null;
    } finally {
      setIsResearching(false);
    }
  };

  const sendMessage = async (content: string) => {
    const userMessage = { id: `user_${Date.now()}`, role: 'user' as const, content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // If in initial phase, trigger research first
    if (state.conversationPhase === 'initial') {
      const researchResults = await triggerResearch(content);
      // After research, continue with clarifying questions
      // Pass research results directly since state won't be updated yet
      await sendChatMessage(newMessages, 'clarifying', researchResults);
      return;
    }

    await sendChatMessage(newMessages, state.conversationPhase);
  };

  const sendChatMessage = async (
    chatMessages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>,
    phase: ConversationPhase,
    researchOverride?: typeof state.research
  ) => {
    setIsLoading(true);

    try {
      // Include research context if available (use override or state)
      const research = researchOverride ?? state.research;
      const researchContext = research
        ? `\n\n[RESEARCH_CONTEXT]\nResearch Summary: ${research.summary}\nKey Findings: ${research.findings.slice(0, 5).map((f) => `- ${f.title}: ${f.content.substring(0, 200)}`).join('\n')}\nSuggested Questions: ${research.suggestedQuestions?.join(', ') || 'None'}\n[/RESEARCH_CONTEXT]`
        : '';

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
          phase,
          researchContext,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      const assistantId = `assistant_${Date.now()}`;

      // Add placeholder message
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
        );
      }

      handleAIResponse(fullContent);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        { id: `error_${Date.now()}`, role: 'assistant', content: `Sorry, there was an error: ${errorMessage}. Check that ANTHROPIC_API_KEY is set in .env.local` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we should show welcome dialog on mount (empty state)
  useEffect(() => {
    const hasNoContent = !state.requirements && state.tasks.length === 0;
    const isInitialPhase = state.conversationPhase === 'initial';
    const hasOnlyWelcomeMessage = messages.length === 1 && messages[0].role === 'assistant';

    if (hasNoContent && isInitialPhase && hasOnlyWelcomeMessage) {
      // Small delay to let the UI render first
      const timer = setTimeout(() => {
        setShowWelcomeDialog(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [messages.length, state.requirements, state.tasks.length, state.conversationPhase]);

  // Phase transitions are now handled in sendMessage and triggerResearch

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const triggerGeneration = async () => {
    // Create a synthetic message to trigger generation
    const currentMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages,
          phase: 'generating' as ConversationPhase,
        }),
      });

      if (!response.ok) throw new Error('Generation failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      // Add placeholder message
      const placeholderId = `gen_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: 'assistant',
          content: 'Generating requirements and tasks...',
        },
      ]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, content: fullContent } : m
          )
        );
      }

      // Parse the complete response
      console.log('Generation complete, full content length:', fullContent.length);
      console.log('Full content preview:', fullContent.substring(0, 500));
      const parsed = parseAIResponse(fullContent);

      console.log('Parsed result:', {
        hasRequirements: !!parsed.requirements,
        hasTasks: !!parsed.tasks,
        tasksCount: parsed.tasks?.length,
      });

      if (parsed.requirements) {
        console.log('Dispatching SET_REQUIREMENTS');
        dispatch({ type: 'SET_REQUIREMENTS', payload: parsed.requirements });
      }

      if (parsed.tasks) {
        console.log('Dispatching SET_TASKS with', parsed.tasks.length, 'tasks');
        dispatch({ type: 'SET_TASKS', payload: parsed.tasks });
        dispatch({ type: 'SET_PHASE', payload: 'complete' });
        dispatch({ type: 'SET_ACTIVE_TAB', payload: 'tasks' });
      }

      // Update the message with clean content
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, content: parsed.cleanContent || 'Requirements and tasks have been generated! Check the tabs on the right.' }
            : m
        )
      );
    } catch (error) {
      console.error('Generation error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, there was an error generating the requirements. Please try again.',
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    // Reset context state
    dispatch({ type: 'RESET' });

    // Reset chat messages to initial welcome
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hello! I'm BrainGrid, your AI assistant for project planning. Tell me about the project or feature you'd like to work on, and I'll help you create detailed requirements and actionable tasks.",
      },
    ]);

    // Clear input
    setLocalInput('');

    // Show welcome dialog after reset
    setTimeout(() => {
      setShowWelcomeDialog(true);
    }, 100);
  };

  const handleWelcomeSubmit = (description: string) => {
    sendMessage(description);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() || isLoading || isGenerating || isResearching) return;
    sendMessage(localInput);
    setLocalInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow native shortcuts like Cmd+A, Cmd+C, Cmd+V
    if ((e.metaKey || e.ctrlKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasContent = state.requirements || state.tasks.length > 0 || state.research;

  return (
    <>
      <WelcomeDialog
        open={showWelcomeDialog}
        onOpenChange={setShowWelcomeDialog}
        onSubmit={handleWelcomeSubmit}
      />

      <div className="flex h-full w-[420px] flex-col overflow-hidden border-r border-border bg-card">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-semibold text-primary-foreground">BG</span>
            </div>
            <span className="text-sm font-medium">BrainGrid</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={phaseVariants[state.conversationPhase]}>
              {phaseLabels[state.conversationPhase]}
            </Badge>

            {hasContent && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start fresh?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear all generated requirements and tasks. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>
                      Yes, start fresh
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="min-h-0 flex-1 px-4 py-6" ref={scrollRef}>
          <div className="space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {(isLoading || isGenerating || isResearching) && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isResearching
                    ? 'Researching your project domain...'
                    : isGenerating
                      ? 'Generating requirements and tasks...'
                      : 'Thinking...'}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              value={localInput}
              onChange={(e) => setLocalInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                state.conversationPhase === 'complete'
                  ? 'Ask follow-up questions...'
                  : 'Describe your project...'
              }
              className="min-h-[80px] resize-none bg-background"
              disabled={isLoading || isGenerating || isResearching}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {'\u2318'} + Enter to submit
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={!localInput.trim() || isLoading || isGenerating || isResearching}
              >
                {isLoading || isGenerating || isResearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
