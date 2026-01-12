/**
 * Type definitions for VS Code Webview API.
 */

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

/**
 * Acquire the VS Code API object.
 * This function is injected by VS Code when the webview is loaded.
 */
declare function acquireVsCodeApi(): VsCodeApi;
