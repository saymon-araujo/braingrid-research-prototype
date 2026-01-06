# BrainGrid

An AI-powered project planning tool that transforms ideas into structured requirements and actionable tasks through research-driven conversations.

## Overview

BrainGrid combines domain research with intelligent questioning to help you plan software projects. Instead of jumping straight to requirements, it first researches your project domain to understand best practices, common pitfalls, and edge cases—then asks informed clarifying questions before generating comprehensive documentation.

## How It Works

```
1. Describe Your Idea     →  "I want to build a focus timer app"
2. Domain Research        →  AI researches Pomodoro techniques, timer UX patterns, etc.
3. Clarifying Questions   →  "Research shows session tracking improves engagement.
                              Would you like to include productivity analytics?"
4. Requirements & Tasks   →  Structured requirements document + actionable task list
```

### Conversation Phases

| Phase | Description |
|-------|-------------|
| **Initial** | User describes their project idea |
| **Researching** | Perplexity Sonar gathers domain knowledge, best practices, and pitfalls |
| **Clarifying** | AI asks 3-5 informed questions based on research findings |
| **Generating** | Creates requirements document and task breakdown |
| **Complete** | Follow-up assistance and refinements |

## Features

- **Domain Research** — Automatically researches your project domain using Perplexity Sonar
- **Informed Questions** — Asks clarifying questions based on discovered best practices and pitfalls
- **Requirements Document** — Generates comprehensive requirements with goals, user personas, and edge cases
- **Task Breakdown** — Creates actionable tasks with subtasks and acceptance criteria
- **Research Tab** — Browse all gathered domain knowledge organized by category
- **Editable Outputs** — Edit generated requirements and toggle task completion

## Tech Stack

- **Framework**: Next.js 15 with React 19 and App Router
- **AI**: Claude Opus 4.5 via Vercel AI SDK
- **Research**: Perplexity Sonar API
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **State**: React Context with useReducer

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Anthropic API key
- Perplexity API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/braingrid.git
cd braingrid

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
```

### Environment Variables

Create a `.env.local` file with:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
PERPLEXITY_API_KEY=pplx-your-key-here
```

### Running the App

```bash
# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

Open [http://localhost:3000](http://localhost:3000) to start planning your project.

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── chat/          # Streaming chat endpoint (Claude)
│   │   └── research/      # Domain research endpoint (Perplexity + Claude)
│   ├── globals.css        # Tailwind styles and theme
│   ├── layout.tsx         # Root layout with providers
│   └── page.tsx           # Main page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── chat-panel.tsx     # Chat interface and conversation flow
│   ├── content-panel.tsx  # Tabbed content area
│   ├── requirements-tab.tsx
│   ├── tasks-tab.tsx
│   └── research-tab.tsx
├── context/
│   └── braingrid-context.tsx  # Global state management
├── lib/
│   ├── prompts.ts         # AI system prompts by phase
│   ├── ai-utils.ts        # Response parsing utilities
│   └── utils.ts           # General utilities
└── types/
    └── index.ts           # TypeScript definitions
```

## API Endpoints

### POST `/api/research`

Triggers domain research for a project description.

```typescript
// Request
{ projectDescription: string }

// Response
{
  query: string,
  findings: ResearchFinding[],
  summary: string,
  suggestedQuestions: string[],
  timestamp: Date
}
```

### POST `/api/chat`

Streaming chat endpoint for conversation.

```typescript
// Request
{
  messages: Message[],
  phase: ConversationPhase,
  researchContext?: string
}

// Response: Streaming text
```

## Development

```bash
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm lint     # Run ESLint
```

## License

MIT
