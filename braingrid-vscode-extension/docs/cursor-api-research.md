# Cursor AI Extension API Research

## Research Date
January 2026

## Overview

This document summarizes research into Cursor's extension API capabilities for injecting context into its AI chat interface.

## Background

Cursor is a fork of VS Code with built-in AI capabilities. BrainGrid seeks to integrate with Cursor to enable direct task context injection from the extension's TreeView into Cursor's AI chat.

## Current Implementation

BrainGrid currently uses a **clipboard-based approach**:
1. User right-clicks a task in TreeView
2. Selects "Send to Cursor AI"
3. Task context is copied to clipboard
4. User manually pastes into Cursor AI chat

## Research Findings

### Available Command Discovery

Cursor exposes internal commands that can be discovered at runtime using:
```typescript
const commands = await vscode.commands.getCommands(true);
const cursorCommands = commands.filter(cmd =>
    cmd.toLowerCase().includes('cursor') ||
    cmd.toLowerCase().includes('aichat') ||
    cmd.toLowerCase().includes('composer')
);
```

### Known Command Namespaces

Based on community research and reverse engineering:

| Namespace | Purpose | Stability |
|-----------|---------|-----------|
| `aichat.*` | AI chat panel commands | Unofficial |
| `composer.*` | Composer (multi-file) commands | Unofficial |
| `cursor.*` | General Cursor commands | Unofficial |

### Command Examples (Unverified)

These commands have been observed in various Cursor versions but are **not officially documented**:

- `aichat.newchataction` - May open new chat with context
- `aichat.focus` - Focus the AI chat panel
- `composer.startComposer` - Start composer session

### API Stability Concerns

1. **No Official Documentation**: Cursor does not provide official extension API documentation for AI chat integration
2. **Version Variability**: Commands may change between Cursor versions without notice
3. **Parameter Uncertainty**: Command parameters and return types are not specified
4. **Breaking Changes**: Updates to Cursor may break any direct API integration

## Recommendation

### MVP Approach: Clipboard with Optional API

For the MVP, implement a **hybrid approach**:

1. **Primary**: Attempt direct API integration using known commands
2. **Fallback**: Use clipboard when API is unavailable or fails
3. **Configuration**: Allow users to choose their preferred method

### Implementation Strategy

```typescript
async function sendToCursorChat(context: string): Promise<CursorSendResult> {
    // Try known Cursor commands
    const commands = await vscode.commands.getCommands(true);

    // Attempt API methods
    if (commands.includes('aichat.newchataction')) {
        try {
            await vscode.commands.executeCommand('aichat.newchataction', context);
            return { success: true, method: 'api' };
        } catch {
            // Fall through to clipboard
        }
    }

    // Fallback to clipboard
    return { success: false, method: 'clipboard' };
}
```

### User Configuration

Provide a configuration option:
```json
{
    "braingrid.cursorIntegration": {
        "type": "string",
        "enum": ["auto", "api", "clipboard"],
        "default": "auto",
        "description": "Method for sending tasks to Cursor AI"
    }
}
```

| Value | Behavior |
|-------|----------|
| `auto` | Try API first, fall back to clipboard |
| `api` | API only (may fail in non-Cursor environments) |
| `clipboard` | Always use clipboard |

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| API changes break integration | Graceful fallback to clipboard |
| Command not available | Runtime command detection |
| VS Code (non-Cursor) environment | Clipboard fallback works everywhere |
| Silent API failures | Logging and user notifications |

## Future Considerations

1. **Official API**: Monitor Cursor releases for official extension API
2. **Cursor Plugin System**: Cursor may introduce a proper plugin system
3. **MCP Integration**: Model Context Protocol may provide standardized integration

## Conclusion

The **clipboard-based approach remains the most reliable** for MVP, with optional API integration for improved UX when running in Cursor. The hybrid approach ensures the extension works in both VS Code and Cursor environments without breaking.

## References

- Cursor: https://cursor.com
- VS Code Extension API: https://code.visualstudio.com/api
- Community discussions on Cursor internals (unofficial)
