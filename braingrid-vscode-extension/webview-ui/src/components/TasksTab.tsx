/**
 * TasksTab - Displays generated tasks with progress tracking and actions.
 */
import { useState } from 'react';
import TaskCard from './TaskCard';

interface Subtask {
    id: string;
    title: string;
    completed: boolean;
}

interface Task {
    id: string;
    title: string;
    description: string;
    completed: boolean;
    subtasks: Subtask[];
    acceptanceCriteria: string[];
}

interface TasksTabProps {
    tasks: Task[];
    onToggleTask: (taskId: string) => void;
    onToggleSubtask: (taskId: string, subtaskId: string) => void;
    onCopyPrompt: (taskId: string) => void;
    onSendToClaudeCode: (taskId: string) => void;
}

function TasksTab({
    tasks,
    onToggleTask,
    onToggleSubtask,
    onCopyPrompt,
    onSendToClaudeCode
}: TasksTabProps) {
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

    const toggleExpanded = (taskId: string) => {
        setExpandedTasks(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    if (tasks.length === 0) {
        return (
            <div className="tab-empty-state">
                <div className="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                </div>
                <h3 className="empty-title">No Tasks Yet</h3>
                <p className="empty-description">
                    Start a conversation in the Chat tab to generate project tasks.
                </p>
            </div>
        );
    }

    const completedCount = tasks.filter(t => t.completed).length;
    const progressPercent = (completedCount / tasks.length) * 100;

    return (
        <div className="tasks-tab">
            {/* Header with progress */}
            <div className="tasks-header">
                <span className="tasks-title">Project Tasks</span>
                <div className="tasks-progress-container">
                    <span className="tasks-progress-text">
                        {completedCount}/{tasks.length} completed
                    </span>
                    <div className="tasks-progress-bar">
                        <div
                            className="tasks-progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Task list */}
            <div className="tasks-list">
                {tasks.map(task => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        isExpanded={expandedTasks.has(task.id)}
                        onToggleExpand={() => toggleExpanded(task.id)}
                        onToggleComplete={() => onToggleTask(task.id)}
                        onToggleSubtask={(subtaskId) => onToggleSubtask(task.id, subtaskId)}
                        onCopyPrompt={() => onCopyPrompt(task.id)}
                        onSendToClaudeCode={() => onSendToClaudeCode(task.id)}
                    />
                ))}
            </div>
        </div>
    );
}

export default TasksTab;
