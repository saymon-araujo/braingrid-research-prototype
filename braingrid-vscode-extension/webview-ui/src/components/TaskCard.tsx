/**
 * TaskCard - Expandable card for a single task with subtasks, criteria, and actions.
 */

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

interface TaskCardProps {
    task: Task;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onToggleComplete: () => void;
    onToggleSubtask: (subtaskId: string) => void;
    onCopyPrompt: () => void;
    onSendToClaudeCode: () => void;
}

function TaskCard({
    task,
    isExpanded,
    onToggleExpand,
    onToggleComplete,
    onToggleSubtask,
    onCopyPrompt,
    onSendToClaudeCode
}: TaskCardProps) {
    const hasContent = task.description || task.subtasks.length > 0 || task.acceptanceCriteria.length > 0;
    const completedSubtasks = task.subtasks.filter(s => s.completed).length;

    return (
        <div className={`task-card ${task.completed ? 'completed' : ''}`}>
            {/* Header */}
            <div
                className="task-card-header"
                onClick={hasContent ? onToggleExpand : undefined}
                style={{ cursor: hasContent ? 'pointer' : 'default' }}
            >
                {/* Expand chevron */}
                {hasContent && (
                    <span className={`task-chevron ${isExpanded ? 'expanded' : ''}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </span>
                )}

                {/* Checkbox */}
                <label className="task-checkbox" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={onToggleComplete}
                    />
                    <span className="checkbox-custom" />
                </label>

                {/* Title */}
                <span className={`task-title ${task.completed ? 'completed' : ''}`}>
                    {task.title}
                </span>

                {/* Subtask progress */}
                {task.subtasks.length > 0 && (
                    <span className="task-subtask-count">
                        {completedSubtasks}/{task.subtasks.length}
                    </span>
                )}

                {/* Status indicator */}
                <span className={`task-status ${task.completed ? 'done' : ''}`}>
                    {task.completed ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                        </svg>
                    )}
                </span>
            </div>

            {/* Expanded content */}
            {isExpanded && hasContent && (
                <div className="task-card-content">
                    {/* Description */}
                    {task.description && (
                        <div className="task-description">
                            {task.description}
                        </div>
                    )}

                    {/* Subtasks */}
                    {task.subtasks.length > 0 && (
                        <div className="task-section">
                            <div className="task-section-header">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="8" y1="6" x2="21" y2="6" />
                                    <line x1="8" y1="12" x2="21" y2="12" />
                                    <line x1="8" y1="18" x2="21" y2="18" />
                                    <line x1="3" y1="6" x2="3.01" y2="6" />
                                    <line x1="3" y1="12" x2="3.01" y2="12" />
                                    <line x1="3" y1="18" x2="3.01" y2="18" />
                                </svg>
                                <span>Subtasks</span>
                            </div>
                            <div className="subtask-list">
                                {task.subtasks.map(subtask => (
                                    <label key={subtask.id} className="subtask-item">
                                        <input
                                            type="checkbox"
                                            checked={subtask.completed}
                                            onChange={() => onToggleSubtask(subtask.id)}
                                        />
                                        <span className="checkbox-custom small" />
                                        <span className={`subtask-title ${subtask.completed ? 'completed' : ''}`}>
                                            {subtask.title}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Acceptance Criteria */}
                    {task.acceptanceCriteria.length > 0 && (
                        <div className="task-section">
                            <div className="task-section-header">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <circle cx="12" cy="12" r="6" />
                                    <circle cx="12" cy="12" r="2" />
                                </svg>
                                <span>Acceptance Criteria</span>
                            </div>
                            <ul className="criteria-list">
                                {task.acceptanceCriteria.map((criterion, idx) => (
                                    <li key={idx} className="criteria-item">
                                        {criterion}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="task-actions">
                        <button className="task-action-btn primary" onClick={onSendToClaudeCode}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="4 17 10 11 4 5" />
                                <line x1="12" y1="19" x2="20" y2="19" />
                            </svg>
                            Claude Code
                        </button>
                        <button className="task-action-btn" onClick={onCopyPrompt}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TaskCard;
