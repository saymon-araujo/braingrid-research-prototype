# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev        # Start development server
pnpm build      # Build for production
pnpm start      # Start production server
pnpm lint       # Run ESLint
```

## Architecture

This is a Next.js 16 application with React 19 using the App Router pattern. The project uses shadcn/ui components with Tailwind CSS v4.

### Layout Structure

The app follows a two-panel layout:
- **ChatPanel** (`components/chat-panel.tsx`): Left sidebar with chat interface for AI-powered task assistance
- **ContentPanel** (`components/content-panel.tsx`): Main content area with tabs for Requirements and Tasks

### Key Directories

- `app/` - Next.js App Router pages and layouts
- `components/` - Application components (chat-panel, content-panel, requirements-tab, tasks-tab)
- `components/ui/` - shadcn/ui components (57 components, "new-york" style)
- `hooks/` - Custom React hooks (use-mobile, use-toast)
- `lib/` - Utilities (`cn()` function for className merging)

### Component Patterns

- All components use `"use client"` directive (client-side rendering)
- State management is local with React useState (no global state library)
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

### Note

TypeScript build errors are ignored in `next.config.mjs` (`ignoreBuildErrors: true`).
