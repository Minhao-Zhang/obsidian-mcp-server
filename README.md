# Obsidian MCP Server

English | [中文文档（机翻）](README_zh-CN.md)

This Obsidian plugin runs a local MCP (Model Context Protocol) server, allowing external applications (like AI assistants, scripts, or other tools) to interact with your Obsidian vault through a standardized interface.

This is a work-in-progress plugin, and while it is functional, it may have bugs or incomplete features. Please report any issues you encounter. I don't know TypeScript that well so there might be security and reliability issues. You can help by opening issues or pull requests on GitHub. I will try to respond to them as soon as possible.

## Features

- **Local MCP Server:** Runs an SSE-based MCP server on a configurable port.
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
  - **Internationalization:** Supports English and Chinese interface languages based on Obsidian's language setting.

## MCP Tools

- `simple_vector_search`: Semantic search for notes using vector embeddings.
- `count_entries`: Counts indexed notes and chunks in the Orama database.
- `list_files`: Lists files and folders within a specified directory.
- `read_file`: Reads the content of a specific file.
- `create_file`: Creates a new file.
- `edit_file`: Edits a specific range of lines within an existing file.
- `delete_file`: Deletes a file.
- `create_folder`: Creates a folder.
- `delete_folder`: Deletes a folder.

## TODO

- [x] Multi-language support (English, Chinese)
- [x] Provide basic file/folder manipulation tools (create, read, edit, delete)
- [ ] Add a tool that can generate notes based on Obsidian templates
- [ ] Implement search with filtering by metadata (frontmatter)
- [ ] Implement live tracking and updating of new notes and edits

## Configuration

Access the plugin settings within Obsidian to configure:

1. **Server Settings:** Port number and whether the server should start automatically with Obsidian.
2. **Embedding Model:** Provide the URL, model name, and API key for your chosen OpenAI-compatible embedding provider. Verify the connection using the provided button.
3. **Vector Store:**
    - Define file patterns (like `.gitignore`) to exclude specific files or folders from indexing. You can copy patterns directly from your vault's `.gitignore` file.
    - Adjust chunking parameters (size, overlap, separators) if needed, though default values are generally suitable.
4. **MCP Tools:** Enable or disable *individual* tools (like `read_file`, `create_folder`, etc.) provided by the server via toggles in the settings. A server restart (using the button in the settings) is required for changes to take effect.

## Usage

1. **Configure:** Set up the plugin via the Obsidian settings panel, especially the Embedding Model details.
2. **Index Vault:** Run the "Re-index Vault (MCP Server)" command from the Obsidian command palette. This is necessary for the `simple_vector_search` tool to function. Wait for the indexing process to complete (a notification will appear).
3. **Start Server:** Ensure the MCP server is running. Either enable "Auto Start MCP" in settings or use the "Start MCP Server" command.
4. **Connect External Tool:** Connect your MCP client (e.g., an AI assistant configured to use MCP) to the server endpoint displayed in the settings (e.g., `http://localhost:8080/sse`).
5. **Utilize Tools:** Use the available MCP tools (`simple_vector_search`, `list_files`, `read_file`, etc.) from your connected client to interact with your Obsidian vault.
6. In your favorite MCP capable client, configure MCP to SSE mode and set the endpoint to `http://localhost:8080/sse` (or the port you configured). Then you can use the tools exposed by this plugin.
7. **Stop Server:** Use the "Stop MCP Server" command to stop the server when not in use.

## Development

This project uses TypeScript. Ensure you have Node.js and npm installed.

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to compile the plugin and watch for changes.
4. Copy the `main.js`, `manifest.json`, and `styles.css` files into your Obsidian vault's `.obsidian/plugins/mcp-server/` directory.
5. Reload Obsidian and enable the plugin.

## Known Issue & Limitations

1. **File Size Limit**: If your vault contains many notes, indexing may fail when the `orama.json` file exceeds 512MB. Currently there is no workaround except to reduce note/chunk count.

2. **Number Storage**: OramaDB stores floating point numbers as raw strings, which can rapidly increase database size.
