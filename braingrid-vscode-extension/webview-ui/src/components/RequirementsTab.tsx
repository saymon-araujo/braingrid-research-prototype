/**
 * RequirementsTab - Displays generated requirements as formatted markdown.
 */
import ReactMarkdown from 'react-markdown';

interface RequirementsTabProps {
    requirements: string | null;
}

function RequirementsTab({ requirements }: RequirementsTabProps) {
    if (!requirements) {
        return (
            <div className="tab-empty-state">
                <div className="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                    </svg>
                </div>
                <h3 className="empty-title">No Requirements Yet</h3>
                <p className="empty-description">
                    Start a conversation in the Chat tab to generate project requirements.
                </p>
            </div>
        );
    }

    return (
        <div className="requirements-tab">
            <div className="requirements-header">
                <span className="requirements-title">Project Requirements</span>
            </div>
            <div className="requirements-content">
                <ReactMarkdown
                    components={{
                        h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
                        h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
                        h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
                        p: ({ children }) => <p className="md-p">{children}</p>,
                        ul: ({ children }) => <ul className="md-ul">{children}</ul>,
                        ol: ({ children }) => <ol className="md-ol">{children}</ol>,
                        li: ({ children }) => <li className="md-li">{children}</li>,
                        code: ({ children }) => <code className="md-code">{children}</code>,
                        pre: ({ children }) => <pre className="md-pre">{children}</pre>,
                        blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
                        strong: ({ children }) => <strong className="md-strong">{children}</strong>,
                    }}
                >
                    {requirements}
                </ReactMarkdown>
            </div>
        </div>
    );
}

export default RequirementsTab;
