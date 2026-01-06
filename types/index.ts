// Conversation phase tracking
export type ConversationPhase =
  | 'initial'      // User describes task
  | 'clarifying'   // AI asks questions
  | 'generating'   // AI creates requirements/tasks
  | 'complete';    // Generation finished

// Chat message structure
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Subtask structure
export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

// Task structure with acceptance criteria
export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  subtasks: Subtask[];
  acceptanceCriteria: string[];
}

// Global state for BrainGrid
export interface BrainGridState {
  conversationPhase: ConversationPhase;
  messages: Message[];
  requirements: string;
  tasks: Task[];
  isLoading: boolean;
  activeTab: 'requirements' | 'tasks';
}

// Action types for reducer
export type BrainGridAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_LAST_MESSAGE'; payload: string }
  | { type: 'SET_PHASE'; payload: ConversationPhase }
  | { type: 'SET_REQUIREMENTS'; payload: string }
  | { type: 'SET_TASKS'; payload: Task[] }
  | { type: 'TOGGLE_TASK'; payload: string }
  | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ACTIVE_TAB'; payload: 'requirements' | 'tasks' }
  | { type: 'RESET' };

// Parsed AI response structure
export interface ParsedAIResponse {
  cleanContent: string;
  shouldGenerate: boolean;
  requirements: string | null;
  tasks: Task[] | null;
}
