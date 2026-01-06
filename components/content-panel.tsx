'use client';

import { FileText, ListTodo, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RequirementsTab } from '@/components/requirements-tab';
import { TasksTab } from '@/components/tasks-tab';
import { useBrainGrid } from '@/context/braingrid-context';

export function ContentPanel() {
  const { state, dispatch } = useBrainGrid();

  const handleTabChange = (value: string) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: value as 'requirements' | 'tasks' });
  };

  const hasGeneratedContent = state.requirements || state.tasks.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-foreground">Project Overview</h1>
          {state.conversationPhase === 'complete' && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              AI Generated
            </Badge>
          )}
        </div>
        {hasGeneratedContent && (
          <div className="text-xs text-muted-foreground">
            {state.tasks.length} tasks generated
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={state.activeTab}
        onValueChange={handleTabChange}
        className="flex flex-1 flex-col"
      >
        <div className="border-b border-border px-6">
          <TabsList className="h-12 bg-transparent p-0">
            <TabsTrigger
              value="requirements"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FileText className="mr-2 h-4 w-4" />
              Requirements
              {state.requirements && (
                <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <ListTodo className="mr-2 h-4 w-4" />
              Tasks
              {state.tasks.length > 0 && (
                <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="requirements" className="m-0 h-full">
            <RequirementsTab />
          </TabsContent>
          <TabsContent value="tasks" className="m-0 h-full">
            <TasksTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
