import ReactMarkdown from 'react-markdown';

/**
 * Chat message structure.
 */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface ChatMessageProps {
    message: Message;
    isStreaming?: boolean;
}

/**
 * ChatMessage component displays a single chat message.
 * User messages are right-aligned, assistant messages are left-aligned.
 * Assistant messages render markdown content.
 */
function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
    const isUser = message.role === 'user';

    return (
        <div className={`message message-${message.role}`}>
            <div className="message-content">
                {isUser ? (
                    message.content
                ) : (
                    <>
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                        {isStreaming && <span className="streaming-cursor">▊</span>}
                    </>
                )}
            </div>
        </div>
    );
}

export default ChatMessage;
