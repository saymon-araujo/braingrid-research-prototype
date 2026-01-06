// Conversation phase tracking
export type ConversationPhase =
  | 'initial'      // User describes task
  | 'researching'  // AI researches domain knowledge
  | 'clarifying'   // AI asks informed questions
  | 'generating'   // AI creates requirements/tasks
  | 'complete';    // Generation finished

// Research finding structure
export interface ResearchFinding {
  id: string;
  category: 'concept' | 'best_practice' | 'pitfall' | 'edge_case' | 'technical';
  title: string;
  content: string;
  source?: string;
  relevance: 'high' | 'medium' | 'low';
}

// Research results structure
export interface ResearchResults {
  query: string;
  findings: ResearchFinding[];
  summary: string;
  suggestedQuestions: string[];
  timestamp: Date;
}

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
  requirements: string | null;
  tasks: Task[];
  research: ResearchResults | null;
  isLoading: boolean;
  activeTab: 'requirements' | 'tasks' | 'research';
}

// Action types for reducer
export type BrainGridAction =
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'UPDATE_LAST_MESSAGE'; payload: string }
  | { type: 'SET_PHASE'; payload: ConversationPhase }
  | { type: 'SET_REQUIREMENTS'; payload: string }
  | { type: 'SET_TASKS'; payload: Task[] }
  | { type: 'SET_RESEARCH'; payload: ResearchResults }
  | { type: 'TOGGLE_TASK'; payload: string }
  | { type: 'TOGGLE_SUBTASK'; payload: { taskId: string; subtaskId: string } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ACTIVE_TAB'; payload: 'requirements' | 'tasks' | 'research' }
  | { type: 'RESET' };

// Parsed AI response structure
export interface ParsedAIResponse {
  cleanContent: string;
  shouldGenerate: boolean;
  requirements: string | null;
  tasks: Task[] | null;
}
