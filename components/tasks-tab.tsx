'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, Circle, CheckCircle2, Target, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrainGrid } from '@/context/braingrid-context';

export function TasksTab() {
  const { state, dispatch } = useBrainGrid();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const tasks = state.tasks;
  const hasGeneratedTasks = tasks.length > 0;

  const toggleTask = (taskId: string) => {
    if (hasGeneratedTasks) {
      dispatch({ type: 'TOGGLE_TASK', payload: taskId });
    }
  };

  const toggleSubtask = (taskId: string, subtaskId: string) => {
    if (hasGeneratedTasks) {
      dispatch({ type: 'TOGGLE_SUBTASK', payload: { taskId, subtaskId } });
    }
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTasks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  // Empty state when no tasks
  if (!hasGeneratedTasks) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="text-sm font-medium text-muted-foreground">Task List</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <ListChecks className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">No tasks yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start a conversation in the chat panel to generate your project tasks and
              acceptance criteria.
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
          Task List ({completedCount}/{tasks.length})
        </span>
        <div className="flex items-center gap-2">
          <div className="h-2 w-32 rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(completedCount / tasks.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          <div className="space-y-2">
            {tasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id);
              const hasContent =
                task.description ||
                (task.subtasks && task.subtasks.length > 0) ||
                (task.acceptanceCriteria && task.acceptanceCriteria.length > 0);

              return (
                <div key={task.id} className="rounded-lg border border-border bg-card">
                  <div
                    className={cn(
                      'flex items-start gap-3 p-4 transition-colors',
                      hasContent && 'cursor-pointer hover:bg-muted/50'
                    )}
                    onClick={() => hasContent && toggleExpanded(task.id)}
                  >
                    {hasContent && (
                      <ChevronRight
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-90'
                        )}
                      />
                    )}
                    {!hasContent && <div className="w-4 shrink-0" />}

                    <div
                      className="flex flex-1 items-start gap-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTask(task.id);
                      }}
                    >
                      <Checkbox
                        checked={task.completed}
                        className="mt-0.5"
                        disabled={!hasGeneratedTasks}
                      />
                      <div className="flex-1">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            task.completed
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          )}
                        >
                          {task.title}
                        </p>
                      </div>
                    </div>

                    {task.completed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>

                  {isExpanded && hasContent && (
                    <div className="border-t border-border px-4 pb-4 pt-3">
                      {task.description && (
                        <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      )}

                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="mb-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <ListChecks className="h-3 w-3" />
                            Subtasks
                          </div>
                          {task.subtasks.map((subtask) => (
                            <div
                              key={subtask.id}
                              className={cn(
                                'flex items-center gap-3 rounded-md px-2 py-1.5',
                                hasGeneratedTasks && 'cursor-pointer hover:bg-muted/50'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSubtask(task.id, subtask.id);
                              }}
                            >
                              <Checkbox
                                checked={subtask.completed}
                                className="h-3.5 w-3.5"
                                disabled={!hasGeneratedTasks}
                              />
                              <span
                                className={cn(
                                  'flex-1 text-sm',
                                  subtask.completed
                                    ? 'text-muted-foreground line-through'
                                    : 'text-foreground'
                                )}
                              >
                                {subtask.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Target className="h-3 w-3" />
                            Acceptance Criteria
                          </div>
                          <ul className="space-y-1.5 pl-2">
                            {task.acceptanceCriteria.map((criterion, index) => (
                              <li
                                key={index}
                                className="flex items-start gap-2 text-sm text-muted-foreground"
                              >
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                                <span>{criterion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
