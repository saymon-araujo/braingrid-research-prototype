/**
 * TabNavigation - Tab header for switching between Chat, Requirements, and Tasks views.
 */

export type TabType = 'chat' | 'requirements' | 'tasks';

interface TabNavigationProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    hasRequirements: boolean;
    hasTasks: boolean;
    taskProgress?: { completed: number; total: number };
}

function TabNavigation({
    activeTab,
    onTabChange,
    hasRequirements,
    hasTasks,
    taskProgress
}: TabNavigationProps) {
    return (
        <div className="tab-navigation">
            <button
                className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => onTabChange('chat')}
            >
                Chat
            </button>
            <button
                className={`tab-button ${activeTab === 'requirements' ? 'active' : ''}`}
                onClick={() => onTabChange('requirements')}
            >
                Requirements
                {hasRequirements && <span className="tab-indicator" />}
            </button>
            <button
                className={`tab-button ${activeTab === 'tasks' ? 'active' : ''}`}
                onClick={() => onTabChange('tasks')}
            >
                Tasks
                {hasTasks && taskProgress && (
                    <span className="tab-progress">
                        {taskProgress.completed}/{taskProgress.total}
                    </span>
                )}
                {hasTasks && !taskProgress && <span className="tab-indicator" />}
            </button>
        </div>
    );
}

export default TabNavigation;
