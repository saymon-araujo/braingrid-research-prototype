import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

/**
 * ChatInput component provides a textarea with auto-resize and send button.
 * Enter sends the message, Shift+Enter creates a new line.
 */
function ChatInput({ onSend, disabled = false, placeholder = 'Type your message...' }: ChatInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea based on content
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
        }
    }, [value]);

    /**
     * Handle input change.
     */
    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
    };

    /**
     * Handle key press - Enter to send, Shift+Enter for new line.
     */
    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    /**
     * Send the message.
     */
    const handleSend = () => {
        const trimmedValue = value.trim();
        if (trimmedValue && !disabled) {
            onSend(trimmedValue);
            setValue('');
            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    return (
        <div className="input-container">
            <div className="input-wrapper">
                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                />
                <button
                    className="send-button"
                    onClick={handleSend}
                    disabled={disabled || !value.trim()}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default ChatInput;
