# Master of OpenCode: Obsidian Plugin Specification

## 1. Project Overview
**Project Name:** Master of OpenCode (OpenCode for Obsidian)
**Goal:** To integrate the powerful **OpenCode** CLI agent directly into Obsidian, creating a seamless, "Universal AI" development environment within the note-taking app.
**Core Value:** Combining OpenCode's vast multi-model support (OpenAI, Anthropic, Google, etc.) with Obsidian's knowledge base capabilities in a premium, user-friendly sidebar interface.

## 2. Design Philosophy
*   **"Universal Access"**: If OpenCode supports a model, this plugin must support it.
*   **"Wow" Aesthetics**: Modern, fluid, and premium UI (Glassmorphism, animated transitions) that feels native yet futuristic.
*   **"Deep Context"**: The plugin is not just a chat; it understands the specific context of the user's Vault, folders, and active files.
*   **"Ease of Use"**: Zero-friction setup. Complexities of the CLI (like flags and ports) should be abstracted behind a clean UI.

## 3. Key Features Specification

### 3.1. Multi-Model Engine (The Core Request)
Users can leverage OpenCode's agnostic model support completely from the UI.

*   **Model Selector in Toolbar:**
    *   A prominent dropdown in the chat header to switch models on the fly.
    *   Quick toggles for "Favorites" (e.g., Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro).
*   **Detailed Settings Configuration:**
    *   **Provider Selection:** Dynamic input/dropdown for providers (e.g., `anthropic`, `openai`, `google`, `ollama`).
    *   **Model ID Input:** Free-form text field for specific model IDs (e.g., `claude-3-5-sonnet-20240620`).
    *   **Settings UI:**
        ```markdown
        [Settings Page]
        > OpenCode Core
        Active Provider: [ Dropdown: Anthropic / OpenAI / Google / Ollama / Custom ]
        Model Name: [ Input: e.g., claude-3-5-sonnet ]
        Custom API Base URL:  [ Input ] (for local LLMs or proxies)
        Context Window Limit: [ Slider ]
        ```

### 3.2. Sidebar Agent Interface
*   **Chat UI:**
    *   Threaded conversations with distinct styling for "User", "Agent (Thinking)", "Agent (Response)", and "Tool Use".
    *   **Rich Markdown Rendering:** Full support for syntax highlighting, mathematical equations, and diagrams.
    *   **Tool Execution Visualization:** When OpenCode runs a command (e.g., `ls`, `read_file`), show a beautiful, collapsible "Task Block" indicating progress (Running... -> Done).

### 3.3. Obsidian Integration
*   **Vault Awareness:** The plugin runs with the Vault root as its working directory.
*   **Active File Context:**
    *   One-click button ("Add Active Note") to inject the current view's content into the LLM context.
    *   Drag-and-drop support for files into the chat input.
*   **Note Generation:**
    *   Agent can create new notes or append to existing notes via tool use.
    *   "Export Chat to Note" button to save useful solutions.

### 3.4. Technical Architecture

#### Connectors
We will support two modes of operation to ensure stability and flexibility:

1.  **CLI Spawner Mode (Default):**
    *   The plugin spawns the `opencode` process directly as a child process.
    *   Maps User Input -> `stdin`.
    *   Parses `stdout`/`stderr` -> Chat UI.
    *   Benefits: Zero extra setup, uses the user's existing CLI environment.

2.  **Server Mode (Advanced):**
    *   Utilizes the `opencode --port [PORT]` feature.
    *   The plugin acts as an API Client sending HTTP/WebSocket requests to the local server.
    *   Benefits: faster response, persistent state even if Obsidian reloads.

#### Settings Data Structure
```typescript
interface OpenCodeSettings {
  // Model Config
  provider: string; // 'anthropic' | 'openai' | 'google' | ...
  model: string;    // 'gpt-4o', 'gemini-1.5-pro'
  
  // Connection
  executionMode: 'spawn' | 'server';
  serverPort: number; // default: 3000
  opencodePath: string; // Auto-detected or manual override
  
  // UI Preferences
  theme: 'adaptive' | 'dark' | 'light';
  notifications: boolean;
}
```

## 4. Development Roadmap

### Phase 1: Foundation (The Skeleton)
*   [ ] Setup `opencode-obsidian` project scaffolding (React + Obsidian API).
*   [ ] Implement **Settings Tab** with Provider/Model configuration fields.
*   [ ] Build the basic **Process Manager** to spawn `opencode` commands.

### Phase 2: Core Functionality (The Brain)
*   [ ] Connect Chat UI Input to OpenCode `stdin`.
*   [ ] Implement **Stream Parser** to handle OpenCode's output and display it effectively (separating text from control characters).
*   [ ] Verify Model Switching works (passing `--model provider/model` flag dynamically).

### Phase 3: Polish & Integration (The Soul)
*   [ ] Apply "Wow" aesthetics (animations, colors).
*   [ ] Implement "Tool Use" visualizers (showing file operations nicely).
*   [ ] Add "Context" features (Right-click file -> "Send to OpenCode").

## 5. Next Steps
1.  Initialize the project in `~/Desktop/Master of Opencode`.
2.  Install dependencies.
3.  Begin Phase 1: Settings & Process Management.
