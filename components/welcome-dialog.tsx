'use client';

import { useState } from 'react';
import { Sparkles, Lightbulb, Code, Palette, Rocket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface WelcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (description: string) => void;
}

const examplePrompts = [
  {
    icon: Code,
    label: 'Developer Tool',
    prompt: 'I want to build a CLI tool that helps developers manage their environment variables across projects',
  },
  {
    icon: Palette,
    label: 'Design System',
    prompt: 'I need a design system with reusable React components, theming support, and documentation',
  },
  {
    icon: Rocket,
    label: 'SaaS Feature',
    prompt: 'I want to add a subscription billing system with multiple tiers and usage tracking',
  },
  {
    icon: Lightbulb,
    label: 'Productivity App',
    prompt: 'I want to create a focus timer with Pomodoro technique, session tracking, and statistics',
  },
];

export function WelcomeDialog({ open, onOpenChange, onSubmit }: WelcomeDialogProps) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    if (input.trim()) {
      onSubmit(input.trim());
      setInput('');
      onOpenChange(false);
    }
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" showCloseButton={false}>
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">What would you like to build?</DialogTitle>
          <DialogDescription>
            Describe your project or feature, and I'll help you create detailed requirements and
            actionable tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your project idea..."
            className="min-h-[100px] resize-none"
            autoFocus
          />

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Or try an example:</p>
            <div className="grid grid-cols-2 gap-2">
              {examplePrompts.map((example) => (
                <button
                  key={example.label}
                  onClick={() => handleExampleClick(example.prompt)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <example.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{example.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!input.trim()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Start Planning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
