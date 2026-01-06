'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Lightbulb, AlertTriangle, Code, Bookmark, ExternalLink } from 'lucide-react';
import { useBrainGrid } from '@/context/braingrid-context';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ResearchFinding } from '@/types';

const categoryConfig: Record<ResearchFinding['category'], { icon: typeof Search; label: string; color: string }> = {
  concept: { icon: Lightbulb, label: 'Concept', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  best_practice: { icon: Bookmark, label: 'Best Practice', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  pitfall: { icon: AlertTriangle, label: 'Pitfall', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  edge_case: { icon: AlertTriangle, label: 'Edge Case', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  technical: { icon: Code, label: 'Technical', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

const relevanceColors: Record<ResearchFinding['relevance'], string> = {
  high: 'bg-red-500/10 text-red-400 border-red-500/20',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  low: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

function FindingCard({ finding }: { finding: ResearchFinding }) {
  const [isOpen, setIsOpen] = useState(finding.relevance === 'high');
  const config = categoryConfig[finding.category];
  const Icon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card/50">
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-md ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{finding.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-xs ${config.color}`}>
                  {config.label}
                </Badge>
                <Badge variant="outline" className={`text-xs ${relevanceColors[finding.relevance]}`}>
                  {finding.relevance} relevance
                </Badge>
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {finding.content}
            </p>
            {finding.source && (
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                <span className="truncate">{finding.source}</span>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ResearchTab() {
  const { state } = useBrainGrid();
  const research = state.research;

  // Empty state when no research
  if (!research) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Domain Research
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">No research yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Research will be automatically conducted when you describe your project. The AI will gather domain knowledge, best practices, and common pitfalls.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Group findings by category
  const groupedFindings = research.findings.reduce((acc, finding) => {
    if (!acc[finding.category]) {
      acc[finding.category] = [];
    }
    acc[finding.category].push(finding);
    return acc;
  }, {} as Record<string, ResearchFinding[]>);

  // Sort findings within each category by relevance
  const relevanceOrder = { high: 0, medium: 1, low: 2 };
  Object.keys(groupedFindings).forEach((category) => {
    groupedFindings[category].sort((a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance]);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm font-medium text-muted-foreground">
          Domain Research
        </span>
        <Badge variant="secondary" className="text-xs">
          {research.findings.length} findings
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-6">
          {/* Summary Section */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <Search className="h-4 w-4 text-primary" />
              Research Summary
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {research.summary}
            </p>
          </div>

          {/* Suggested Questions */}
          {research.suggestedQuestions && research.suggestedQuestions.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Lightbulb className="h-4 w-4 text-primary" />
                Questions to Consider
              </h3>
              <ul className="space-y-2">
                {research.suggestedQuestions.map((question, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary">•</span>
                    {question}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Findings by Category */}
          {Object.entries(groupedFindings).map(([category, findings]) => {
            const config = categoryConfig[category as ResearchFinding['category']];
            return (
              <div key={category}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  {config.label}s ({findings.length})
                </h3>
                <div className="space-y-3">
                  {findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Research timestamp */}
          <div className="text-center text-xs text-muted-foreground">
            Researched: {new Date(research.timestamp).toLocaleString()}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
