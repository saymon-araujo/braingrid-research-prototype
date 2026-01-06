'use client';

import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Edit2, Save, FileText } from 'lucide-react';
import { useBrainGrid } from '@/context/braingrid-context';

export function RequirementsTab() {
  const { state, dispatch } = useBrainGrid();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const hasGeneratedContent = !!state.requirements;

  // Sync edit content when switching to edit mode
  useEffect(() => {
    if (isEditing && state.requirements) {
      setEditContent(state.requirements);
    }
  }, [isEditing, state.requirements]);

  const handleSave = () => {
    if (editContent !== state.requirements) {
      dispatch({ type: 'SET_REQUIREMENTS', payload: editContent });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(state.requirements || '');
    setIsEditing(false);
  };

  // Empty state when no requirements
  if (!hasGeneratedContent) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Requirements Document
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">No requirements yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start a conversation in the chat panel to generate your project requirements and
              tasks.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-medium text-muted-foreground">
          Requirements Document
        </span>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isEditing ? (
          <div className="p-6">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[600px] font-mono text-sm"
            />
          </div>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none p-6">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => (
                  <h1 className="mb-4 text-2xl font-bold text-foreground" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2
                    className="mb-3 mt-6 text-xl font-semibold text-foreground"
                    {...props}
                  />
                ),
                h3: ({ node, ...props }) => (
                  <h3
                    className="mb-2 mt-4 text-lg font-medium text-foreground"
                    {...props}
                  />
                ),
                p: ({ node, ...props }) => (
                  <p className="mb-4 leading-relaxed text-muted-foreground" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul
                    className="mb-4 ml-6 list-disc space-y-2 text-muted-foreground"
                    {...props}
                  />
                ),
                ol: ({ node, ...props }) => (
                  <ol
                    className="mb-4 ml-6 list-decimal space-y-2 text-muted-foreground"
                    {...props}
                  />
                ),
                li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                strong: ({ node, ...props }) => (
                  <strong className="font-semibold text-foreground" {...props} />
                ),
                code: ({ node, ...props }) => (
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground"
                    {...props}
                  />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground"
                    {...props}
                  />
                ),
                hr: ({ node, ...props }) => (
                  <hr className="my-6 border-border" {...props} />
                ),
              }}
            >
              {state.requirements || ''}
            </ReactMarkdown>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
