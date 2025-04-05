# Obsidian MCP Server

This Obsidian plugin runs a local MCP (Model Context Protocol) server, allowing external applications (like AI assistants, scripts, or other tools) to interact with your Obsidian vault through a standardized interface.

This is a work-in-progress plugin, and while it is functional, it may have bugs or incomplete features. Please report any issues you encounter. I don't know TypeScript that well so there might be security and reliability issues. You can help by opening issues or pull requests on GitHub. I will try to respond to them as soon as possible.

## Features

- **Local MCP Server:** Runs an SSE-based MCP server on a configurable port.
- **Vault Interaction Tools:** Exposes the following tools via the MCP server:
  - `simple_vector_search`: Performs semantic search across indexed notes in your vault using vector embeddings. Requires vault indexing to be completed.
  - `count_entries`: Reports the number of indexed document chunks in the vector store.
  - `list_files`: Lists files and folders within a specified directory in your vault.
  - `read_file`: Reads the content of a specific file (optionally with line numbers).
  - `write_file`: Creates a new file within the vault.
  - `edit_file`: Edits a specific range of lines within an existing file.
- **Vault Indexing for Semantic Search:**
  - Indexes the content of your Markdown notes into an Orama vector database.
  - Uses a configurable OpenAI-compatible embedding model (e.g., OpenAI, local Ollama models via compatible endpoints) to generate embeddings.
  - Allows configuration of text chunking parameters (size, overlap, separators).
  - Supports excluding specific files or patterns from indexing using `.gitignore` syntax.
- **Obsidian Integration:**
  - **Commands:** Provides commands in the Obsidian command palette to:
    - Start/Stop the MCP Server.
    - Re-index the entire vault (can be time-consuming and potentially costly depending on the embedding provider).
    - Manually save the vector database index.
  - **Settings Tab:** Offers a dedicated settings panel to configure:
    - Server port and auto-start behavior.
    - Embedding provider details (API endpoint, model name, API key).
    - File exclusion patterns for indexing.
    - Chunking parameters.
    - Connection verification for the embedding provider.
  - **Ribbon Icon:** Adds a status icon to the Obsidian ribbon indicating whether the MCP server is running or stopped.

## Configuration

Access the plugin settings within Obsidian to configure:

1. **Server Settings:** Port number and whether the server should start automatically with Obsidian.
2. **Embedding Model:** Provide the URL, model name, and API key for your chosen OpenAI-compatible embedding provider. Verify the connection using the provided button.
3. **Vector Store:**
    - Define file patterns (like `.gitignore`) to exclude specific files or folders from indexing. You can copy patterns directly from your vault's `.gitignore` file.
    - Adjust chunking parameters (size, overlap, separators) if needed, though default values are generally suitable.

## Usage

1. **Configure:** Set up the plugin via the Obsidian settings panel, especially the Embedding Model details.
2. **Index Vault:** Run the "Re-index Vault (MCP Server)" command from the Obsidian command palette. This is necessary for the `simple_vector_search` tool to function. Wait for the indexing process to complete (a notification will appear).
3. **Start Server:** Ensure the MCP server is running. Either enable "Auto Start MCP" in settings or use the "Start MCP Server" command.
4. **Connect External Tool:** Connect your MCP client (e.g., an AI assistant configured to use MCP) to the server endpoint displayed in the settings (e.g., `http://localhost:8080/sse`).
5. **Utilize Tools:** Use the available MCP tools (`simple_vector_search`, `list_files`, `read_file`, etc.) from your connected client to interact with your Obsidian vault.

## Development

This project uses TypeScript. Ensure you have Node.js and npm installed.

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to compile the plugin and watch for changes.
4. Copy the `main.js`, `manifest.json`, and `styles.css` files into your Obsidian vault's `.obsidian/plugins/mcp-server/` directory.
5. Reload Obsidian and enable the plugin.
