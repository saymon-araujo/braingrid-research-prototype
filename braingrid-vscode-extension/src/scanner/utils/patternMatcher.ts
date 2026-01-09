/**
 * Pattern matching for workflow naming conventions
 */

/**
 * Workflow types detected from function naming patterns
 */
export type WorkflowType =
    | 'authentication'
    | 'payment'
    | 'notification'
    | 'data-sync'
    | 'validation'
    | 'crud'
    | 'unknown';

/**
 * Result of matching a function name against workflow patterns
 */
export interface PatternMatch {
    /** Original function name */
    name: string;
    /** Detected workflow type */
    type: WorkflowType;
    /** Extracted prefix that matched */
    prefix: string;
}

/**
 * Workflow detection patterns mapping prefixes to types
 */
const WORKFLOW_PATTERNS: Record<string, WorkflowType> = {
    // Generic handlers
    'handle': 'unknown',
    'process': 'unknown',

    // Authentication
    'auth': 'authentication',
    'login': 'authentication',
    'logout': 'authentication',
    'signup': 'authentication',
    'register': 'authentication',
    'signin': 'authentication',
    'signout': 'authentication',

    // Validation
    'verify': 'validation',
    'validate': 'validation',
    'check': 'validation',

    // Payment
    'pay': 'payment',
    'charge': 'payment',
    'checkout': 'payment',
    'purchase': 'payment',
    'refund': 'payment',
    'subscribe': 'payment',
    'invoice': 'payment',

    // Notification
    'send': 'notification',
    'notify': 'notification',
    'email': 'notification',
    'alert': 'notification',

    // Data sync
    'sync': 'data-sync',
    'import': 'data-sync',
    'export': 'data-sync',
    'migrate': 'data-sync',

    // CRUD operations
    'fetch': 'crud',
    'get': 'crud',
    'create': 'crud',
    'update': 'crud',
    'delete': 'crud',
    'remove': 'crud',
    'save': 'crud',
    'load': 'crud',
    'list': 'crud',
    'find': 'crud',
    'add': 'crud'
};

/**
 * Sorted patterns by length (longest first) for greedy matching
 */
const SORTED_PATTERNS = Object.keys(WORKFLOW_PATTERNS)
    .sort((a, b) => b.length - a.length);

/**
 * Match a function name against workflow patterns.
 * @param functionName - The function name to analyze
 * @returns Pattern match if found, null otherwise
 */
export function matchWorkflowPattern(functionName: string): PatternMatch | null {
    if (!functionName) return null;

    const lowerName = functionName.toLowerCase();

    // Try each pattern (longest first for greedy matching)
    for (const pattern of SORTED_PATTERNS) {
        if (lowerName.startsWith(pattern)) {
            return {
                name: functionName,
                type: WORKFLOW_PATTERNS[pattern],
                prefix: pattern
            };
        }

        // Also check if pattern appears after common prefixes like "on" or "_"
        const prefixedPatterns = ['on', '_', 'do', 'perform'];
        for (const pfx of prefixedPatterns) {
            if (lowerName.startsWith(pfx + pattern)) {
                return {
                    name: functionName,
                    type: WORKFLOW_PATTERNS[pattern],
                    prefix: pattern
                };
            }
        }
    }

    return null;
}

/**
 * Extract the prefix from a function name using camelCase/PascalCase splitting.
 * @param name - Function name to extract prefix from
 * @returns The extracted prefix in lowercase
 */
export function extractPrefix(name: string): string {
    if (!name) return '';

    // Split on camelCase boundaries: "getUserData" -> ["get", "User", "Data"]
    const parts = name.split(/(?=[A-Z])|_|-/);
    if (parts.length > 0) {
        return parts[0].toLowerCase();
    }

    return name.toLowerCase();
}

/**
 * Group function names by their extracted prefix.
 * @param functions - Array of function names
 * @returns Map of prefix to function names
 */
export function groupByPrefix(functions: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const fn of functions) {
        const prefix = extractPrefix(fn);
        if (!groups.has(prefix)) {
            groups.set(prefix, []);
        }
        groups.get(prefix)!.push(fn);
    }

    return groups;
}

/**
 * Determine the dominant workflow type for a group of handlers.
 * @param handlers - Array of pattern matches
 * @returns The most common workflow type in the group
 */
export function getDominantWorkflowType(handlers: PatternMatch[]): WorkflowType {
    if (handlers.length === 0) return 'unknown';

    const typeCounts = new Map<WorkflowType, number>();
    for (const handler of handlers) {
        const count = typeCounts.get(handler.type) || 0;
        typeCounts.set(handler.type, count + 1);
    }

    // Find the type with the highest count (excluding 'unknown')
    let maxCount = 0;
    let dominantType: WorkflowType = 'unknown';

    for (const [type, count] of typeCounts) {
        if (type !== 'unknown' && count > maxCount) {
            maxCount = count;
            dominantType = type;
        }
    }

    // If all are unknown, return unknown
    if (dominantType === 'unknown' && typeCounts.has('unknown')) {
        return 'unknown';
    }

    return dominantType;
}

/**
 * Convert a resource name to a human-readable workflow name.
 * @param resource - Resource name (e.g., "users", "auth")
 * @returns Human-readable name (e.g., "User Management", "Authentication")
 */
export function resourceToWorkflowName(resource: string): string {
    if (!resource) return 'Unknown';

    // Special case mappings
    const specialMappings: Record<string, string> = {
        'auth': 'Authentication',
        'users': 'User Management',
        'user': 'User Management',
        'posts': 'Post Management',
        'post': 'Post Management',
        'products': 'Product Management',
        'product': 'Product Management',
        'orders': 'Order Management',
        'order': 'Order Management',
        'payments': 'Payment Processing',
        'payment': 'Payment Processing',
        'checkout': 'Checkout Flow',
        'cart': 'Shopping Cart',
        'notifications': 'Notifications',
        'notification': 'Notifications',
        'settings': 'Settings Management',
        'profile': 'Profile Management'
    };

    const lower = resource.toLowerCase();
    if (specialMappings[lower]) {
        return specialMappings[lower];
    }

    // Default: capitalize and add "Management"
    const capitalized = resource.charAt(0).toUpperCase() + resource.slice(1);
    return `${capitalized} Management`;
}
