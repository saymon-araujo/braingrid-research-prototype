# BrainGrid Local Scanner

AI-powered project planning tool that scans your codebase and syncs with BrainGrid cloud for intelligent requirement and task management.

## Features

This extension provides the following commands accessible via the Command Palette (Cmd/Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| **BrainGrid: Scan Project** | Scan your project to analyze codebase structure and dependencies |
| **BrainGrid: Sync to Cloud** | Synchronize local project data with BrainGrid cloud |
| **BrainGrid: Open Chat** | Open the BrainGrid chat interface for AI assistance |
| **BrainGrid: View Artifacts** | View generated artifacts and project documentation |
| **BrainGrid: Login** | Authenticate with your BrainGrid account |

## Requirements

- VS Code 1.85.0 or higher
- BrainGrid account (for cloud sync features)

## Installation

1. Download the `.vsix` file from releases
2. Open VS Code
3. Open the Command Palette (Cmd/Ctrl+Shift+P)
4. Run "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file

## Usage

1. Open a project folder in VS Code
2. Open the Command Palette (Cmd/Ctrl+Shift+P)
3. Type "BrainGrid" to see available commands
4. Select a command to execute

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
cd braingrid-vscode-extension
npm install
```

### Build

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Debug

1. Open this folder in VS Code
2. Press F5 to launch the Extension Development Host
3. Test commands in the new VS Code window

## License

Proprietary - BrainGrid AI
