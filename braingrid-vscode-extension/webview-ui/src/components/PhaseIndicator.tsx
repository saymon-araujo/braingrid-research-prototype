/**
 * Conversation phases in the BrainGrid workflow.
 */
type ConversationPhase =
    | 'initial'
    | 'researching'
    | 'clarifying'
    | 'generating'
    | 'complete';

interface PhaseIndicatorProps {
    phase: ConversationPhase;
}

/**
 * Phase display configuration.
 */
const PHASE_CONFIG: Record<ConversationPhase, { label: string; icon: string }> = {
    initial: { label: 'Ready', icon: '○' },
    researching: { label: 'Researching', icon: '◐' },
    clarifying: { label: 'Clarifying', icon: '◑' },
    generating: { label: 'Generating', icon: '◓' },
    complete: { label: 'Complete', icon: '●' }
};

/**
 * PhaseIndicator displays the current conversation phase as a badge.
 */
function PhaseIndicator({ phase }: PhaseIndicatorProps) {
    const config = PHASE_CONFIG[phase];

    return (
        <span className={`phase-indicator phase-${phase}`}>
            <span>{config.icon}</span>
            <span>{config.label}</span>
        </span>
    );
}

export default PhaseIndicator;
