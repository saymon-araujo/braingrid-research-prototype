'use client';

import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { BrainGridState, BrainGridAction, Message, Task } from '@/types';

const initialState: BrainGridState = {
  conversationPhase: 'initial',
  messages: [
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hello! I'm BrainGrid, your AI assistant for project planning. Tell me about the project or feature you'd like to work on, and I'll help you create detailed requirements and actionable tasks.",
    },
  ],
  requirements: '',
  tasks: [],
  isLoading: false,
  activeTab: 'requirements',
};

function reducer(state: BrainGridState, action: BrainGridAction): BrainGridState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };

    case 'UPDATE_LAST_MESSAGE': {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content: action.payload,
        };
      }
      return { ...state, messages };
    }

    case 'SET_PHASE':
      return { ...state, conversationPhase: action.payload };

    case 'SET_REQUIREMENTS':
      return { ...state, requirements: action.payload };

    case 'SET_TASKS':
      return { ...state, tasks: action.payload };

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload ? { ...t, completed: !t.completed } : t
        ),
      };

    case 'TOGGLE_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload.taskId
            ? {
                ...t,
                subtasks: t.subtasks.map((st) =>
                  st.id === action.payload.subtaskId
                    ? { ...st, completed: !st.completed }
                    : st
                ),
              }
            : t
        ),
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

interface BrainGridContextType {
  state: BrainGridState;
  dispatch: React.Dispatch<BrainGridAction>;
  addUserMessage: (content: string) => Message;
  addAssistantMessage: (content: string) => Message;
}

const BrainGridContext = createContext<BrainGridContextType | null>(null);

export function BrainGridProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const addUserMessage = (content: string): Message => {
    const message: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      content,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: message });
    return message;
  };

  const addAssistantMessage = (content: string): Message => {
    const message: Message = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: message });
    return message;
  };

  return (
    <BrainGridContext.Provider
      value={{ state, dispatch, addUserMessage, addAssistantMessage }}
    >
      {children}
    </BrainGridContext.Provider>
  );
}

export function useBrainGrid() {
  const context = useContext(BrainGridContext);
  if (!context) {
    throw new Error('useBrainGrid must be used within BrainGridProvider');
  }
  return context;
}
