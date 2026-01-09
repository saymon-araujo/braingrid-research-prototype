# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start development server
pnpm build      # Build for production
pnpm start      # Start production server
pnpm lint       # Run ESLint
```

## Environment Variables

Required in `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
PERPLEXITY_API_KEY=pplx-...
```

## Architecture

This is a Next.js 16 application with React 19 using the App Router pattern. The project uses shadcn/ui components with Tailwind CSS v4.

### Application Flow

BrainGrid is an AI-powered project planning tool that transforms project ideas into structured requirements and tasks through a research-driven conversation.

```
User Input → Research (Perplexity) → Clarifying Questions → Generation → Complete
```

**Conversation Phases:**
1. `initial` - User describes their project idea
2. `researching` - Perplexity Sonar researches domain knowledge
3. `clarifying` - AI asks informed questions based on research (3-5 questions)
4. `generating` - AI creates requirements document and tasks
5. `complete` - Generation finished, follow-up assistance available

### Layout Structure

The app follows a two-panel layout:
- **ChatPanel** (`components/chat-panel.tsx`): Left sidebar with chat interface, handles conversation flow and research triggering
- **ContentPanel** (`components/content-panel.tsx`): Main content area with tabs for Requirements, Tasks, and Research

### Key Directories

- `app/` - Next.js App Router pages and layouts
- `app/api/` - API routes for chat and research
- `components/` - Application components (chat-panel, content-panel, requirements-tab, tasks-tab, research-tab)
- `components/ui/` - shadcn/ui components (57 components, "new-york" style)
- `context/` - React Context for global state management
- `hooks/` - Custom React hooks (use-mobile, use-toast)
- `lib/` - Utilities and AI prompts
- `types/` - TypeScript type definitions

### API Routes

**`/api/chat` (POST)**
- Handles streaming chat with Claude
- Uses `streamText` from Vercel AI SDK with `toTextStreamResponse()`
- Accepts: `{ messages, phase, researchContext? }`
- Returns: Streaming text response

**`/api/research` (POST)**
- Triggers domain research pipeline
- Step 1: Perplexity Sonar API for domain knowledge
- Step 2: Claude Opus 4.5 to analyze and structure findings
- Accepts: `{ projectDescription }`
- Returns: `ResearchResults` with findings, summary, suggested questions

### State Management

Global state is managed with React Context + useReducer in `context/braingrid-context.tsx`:

```typescript
interface BrainGridState {
  conversationPhase: ConversationPhase;
  messages: Message[];
  requirements: string | null;
  tasks: Task[];
  research: ResearchResults | null;
  isLoading: boolean;
  activeTab: 'requirements' | 'tasks' | 'research';
}
```

**Key Actions:**
- `SET_PHASE` - Update conversation phase
- `SET_RESEARCH` - Store research results
- `SET_REQUIREMENTS` - Store generated requirements markdown
- `SET_TASKS` - Store generated tasks array
- `ADD_MESSAGE` / `UPDATE_LAST_MESSAGE` - Manage chat messages

### Core Types (`types/index.ts`)

```typescript
type ConversationPhase = 'initial' | 'researching' | 'clarifying' | 'generating' | 'complete';

interface ResearchFinding {
  id: string;
  category: 'concept' | 'best_practice' | 'pitfall' | 'edge_case' | 'technical';
  title: string;
  content: string;
  source?: string;
  relevance: 'high' | 'medium' | 'low';
}

interface ResearchResults {
  query: string;
  findings: ResearchFinding[];
  summary: string;
  suggestedQuestions: string[];
  timestamp: Date;
}

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  subtasks: Subtask[];
  acceptanceCriteria: string[];
}
```

### AI Integration

**Prompts** (`lib/prompts.ts`):
- `getSystemPrompt(phase, researchContext?)` returns phase-specific system prompts
- Clarifying and generating phases include research context when available
- Generation phase uses special markers: `[REQUIREMENTS_START]`, `[TASKS_START]`, etc.

**Parsing** (`lib/ai-utils.ts`):
- `parseAIResponse(content)` extracts requirements and tasks from AI response
- Detects `[READY_TO_GENERATE]` marker to trigger generation phase

### Component Patterns

- All components use `"use client"` directive (client-side rendering)
- Global state accessed via `useBrainGrid()` hook
- Chat streaming uses manual `fetch` with `ReadableStream` processing
- UI components use Radix UI primitives with Tailwind styling
- Class merging uses `cn()` from `lib/utils.ts` (clsx + tailwind-merge)

### Styling

- Tailwind CSS v4 with `@tailwindcss/postcss` plugin
- CSS variables for theming defined in `app/globals.css`
- Dark mode is hardcoded (`className="dark"` on html element)
- Uses OKLCH color space for color definitions

### Path Aliases

```typescript
@/* → ./*  // e.g., @/components, @/lib/utils, @/hooks
```

### Important Implementation Notes

1. **Streaming**: Use `toTextStreamResponse()` not `toDataStreamResponse()` for chat streaming
2. **State Timing**: When triggering research then continuing to chat, pass research results directly to avoid React state timing issues
3. **Phase Transitions**: The `[READY_TO_GENERATE]` marker in AI response triggers transition to generating phase
4. **Research Context**: Format research as string summary before passing to chat API

### Note

TypeScript build errors are ignored in `next.config.mjs` (`ignoreBuildErrors: true`).


<!-- BEGIN BRAINGRID INTEGRATION -->
## BrainGrid Integration

Spec-driven development: turn ideas into AI-ready tasks.

**Slash Commands:**

| Command                     | Description                   |
| --------------------------- | ----------------------------- |
| `/specify [prompt]`         | Create AI-refined requirement |
| `/breakdown [req-id]`       | Break into tasks              |
| `/build [req-id]`           | Get implementation plan       |
| `/save-requirement [title]` | Save plan as requirement      |

**Workflow:**

```bash
/specify "Add auth"  # → REQ-123
/breakdown REQ-123   # → tasks
/build REQ-123       # → plan
```

**Task Commands:**

```bash
braingrid task list -r REQ-123      # List tasks
braingrid task show TASK-456        # Show task details
braingrid task update TASK-456 --status COMPLETED
```

**Auto-detection:** Project from `.braingrid/project.json`, requirement from branch (`feature/REQ-123-*`).

**Full documentation:** [.braingrid/README.md](./.braingrid/README.md)

<!-- END BRAINGRID INTEGRATION -->
