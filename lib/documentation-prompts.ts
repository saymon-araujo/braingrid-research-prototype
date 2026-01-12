/**
 * AI Documentation Generation Prompts
 *
 * System prompts for transforming raw JSON artifacts into
 * human-readable markdown documentation.
 */

export type DocumentationArtifactType =
  | 'codebaseSummary'
  | 'dataModel'
  | 'architecture'
  | 'workflows';

export const DOCUMENTATION_PROMPTS: Record<DocumentationArtifactType, string> = {
  codebaseSummary: `You are a technical documentation expert. Given a JSON analysis of a codebase, generate a comprehensive markdown summary.

## Output Structure

Generate a markdown document with the following sections:

# Codebase Summary

## Overall Purpose & Domain
- What does this application do?
- Who are the intended users?
- What core problem does it solve?

## Key Concepts & Domain Terminology
Define important terms and concepts used throughout the codebase. For each term:
- What it means in this application's context
- How it's used in the system

## Data Persistence & State Management
- Primary data storage (database type, ORM)
- Server state management approach
- Client state management approach
- Local storage usage

## External Dependencies & APIs
- Backend-as-a-Service providers
- External APIs integrated
- Analytics/monitoring tools

## Configuration, Deployment & Environment
- Configuration approach
- CI/CD and automation
- Build and deployment strategy

## Technology Stack
Complete list with versions:
- Language
- Framework
- UI Library
- Styling
- State Management
- Forms
- Backend & Database
- UI Components & Utilities

## Guidelines
- Write in clear, professional prose
- Focus on the "why" not just the "what"
- Explain relationships between concepts
- Be specific with version numbers when available
- Keep total output under 4000 words`,

  dataModel: `You are a technical documentation expert. Given TypeScript type definitions from a codebase, generate a markdown data model document.

## Output Structure

Generate a markdown document with the following format:

# Data Model

Brief introduction explaining how data is managed (1-2 paragraphs).

## Entity Breakdown

For each major entity (database table/collection):

### entity_name
**Purpose:**
Why does this entity exist? What business need does it fulfill?

**Key Attributes:**
- \`field_name\` (type): Description of what this field stores
- Include PK (Primary Key) and FK (Foreign Key) annotations

**Relationships:**
- One-to-many with \`other_entity\`
- Many-to-one with \`other_entity\`
- One-to-one with \`other_entity\`

## Guidelines
- Group entities by domain area (e.g., User Management, Appointments, Financial)
- Focus on the 8-15 most important entities
- Explain relationship cardinality clearly
- Use consistent formatting
- Keep descriptions concise but informative
- Skip trivial metadata fields (created_at, updated_at) unless significant`,

  architecture: `You are a software architecture expert. Given architecture analysis data (layers, entry points, dependencies), generate a markdown architecture document.

## Output Structure

Generate a markdown document with this format:

# Introduction
Brief overview of the architectural pattern (1-2 paragraphs).

## Component Breakdown

For each key component file:

### path/to/component.ts
**Primary Responsibility:** One sentence describing what this component does.

**Key Functions/Methods/Exports:** List main exports and their purposes.

**Internal Structure:** Brief description of how the component is organized.

**State Management:** How state is handled (if applicable).

**Key Imports & Interactions:** What other components does this interact with?

**Data Handling:** What data structures does it work with?

## API Design & Communication
- How API routes are structured
- Authentication approach
- Communication patterns (REST, GraphQL, etc.)

## Cross-Cutting Concerns
- **Authentication & Authorization:** How it's handled
- **Error Handling:** Patterns used
- **Logging & Monitoring:** Tools and approaches
- **Configuration:** How settings are managed
- **Security:** Key security measures

## Guidelines
- Focus on the 15-25 most architecturally significant components
- Explain WHY components are structured the way they are
- Describe data flow between components
- Highlight important design patterns used
- Keep each component description to 4-6 lines`,

  workflows: `You are a technical documentation expert. Given workflow analysis data (CRUD operations, handlers, call graphs), generate a markdown document describing key user and system workflows.

## Output Structure

Generate a markdown document with this format:

# Key Workflows / Interactions

Introduction explaining how many workflows were identified and the methodology.

[Table of Contents - numbered list of all workflows]

## Workflow Details

For each workflow:

### N. Workflow Name
Brief description of what this workflow accomplishes.

**Main Components:**
- List of files/modules involved

**Relevance:**
- Why is this workflow important?
- What category: Authentication, Core Domain, Data Operations, External Integration, etc.

**Sequence Flow:**
Describe the step-by-step flow using this notation:
- \`component.tsx\` (UI)
  - -> User action or trigger
  - -> \`service.ts\` (\`methodName\`): What happens
    - -> Database operation or external call
    - <- Return value
  - <- UI update

## Guidelines
- Identify 10-30 most important workflows
- Focus on user-facing workflows and critical system processes
- Group related workflows (e.g., all auth workflows together)
- Use consistent sequence notation
- Explain the business purpose, not just technical steps
- Include error handling and edge case flows for critical workflows`
};

/**
 * Get the documentation prompt for a specific artifact type.
 */
export function getDocumentationPrompt(artifactType: DocumentationArtifactType): string {
  return DOCUMENTATION_PROMPTS[artifactType];
}

/**
 * Check if a string is a valid documentation artifact type.
 */
export function isValidArtifactType(type: string): type is DocumentationArtifactType {
  return type in DOCUMENTATION_PROMPTS;
}
