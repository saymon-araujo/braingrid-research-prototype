'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
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
  clarifying: 'Gathering Info',
  generating: 'Generating',
  complete: 'Complete',
};

const phaseVariants: Record<ConversationPhase, 'default' | 'secondary' | 'outline'> = {
  initial: 'secondary',
  clarifying: 'default',
  generating: 'outline',
  complete: 'secondary',
};

export function ChatPanel() {
  const { state, dispatch } = useBrainGrid();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false);
  const [localInput, setLocalInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    setMessages,
    append,
  } = useChat({
    api: '/api/chat',
    body: {
      phase: state.conversationPhase,
    },
    initialMessages: state.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })),
    onFinish: (message) => {
      const parsed = parseAIResponse(message.content);

      // Check if we should trigger generation
      if (parsed.shouldGenerate && state.conversationPhase === 'clarifying') {
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
    },
  });

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

  // Transition from initial to clarifying after first user message
  useEffect(() => {
    if (
      state.conversationPhase === 'initial' &&
      messages.filter((m) => m.role === 'user').length >= 1 &&
      messages.filter((m) => m.role === 'assistant').length >= 2
    ) {
      dispatch({ type: 'SET_PHASE', payload: 'clarifying' });
    }
  }, [messages, state.conversationPhase, dispatch]);

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
        // Parse SSE data
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('0:')) {
            // Text chunk
            const text = JSON.parse(line.slice(2));
            fullContent += text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === placeholderId ? { ...m, content: fullContent } : m
              )
            );
          }
        }
      }

      // Parse the complete response
      const parsed = parseAIResponse(fullContent);

      if (parsed.requirements) {
        dispatch({ type: 'SET_REQUIREMENTS', payload: parsed.requirements });
      }

      if (parsed.tasks) {
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
    // Append the user's message from the welcome dialog
    append({
      role: 'user',
      content: description,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() || isLoading || isGenerating) return;
    append({ role: 'user', content: localInput });
    setLocalInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const hasContent = state.requirements || state.tasks.length > 0;

  return (
    <>
      <WelcomeDialog
        open={showWelcomeDialog}
        onOpenChange={setShowWelcomeDialog}
        onSubmit={handleWelcomeSubmit}
      />

      <div className="flex w-[420px] flex-col border-r border-border bg-card">
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
        <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
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
            {(isLoading || isGenerating) && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isGenerating ? 'Generating requirements and tasks...' : 'Thinking...'}
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
              disabled={isLoading || isGenerating}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {'\u2318'} + Enter to submit
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={!localInput.trim() || isLoading || isGenerating}
              >
                {isLoading || isGenerating ? (
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
