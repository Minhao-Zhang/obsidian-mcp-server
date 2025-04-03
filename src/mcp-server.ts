// @ts-nocheck
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { App, Notice } from "obsidian";
import { listFilesTool } from "./tools/list_files.js";
import { readFileTool } from "./tools/read_file.js";
import { writeFileTool } from "./tools/write_files.js";
import { oramaOperations } from "./utils/orama_operations.js";
import { countEntries, closeDatabase } from "./orama-db.js";
import { vectorSearch } from "./tools/vector_search.js";

export class MCPServer {
	private server: FastMCP;
	private port: number;
	// This holds the *active* DB instance used by tools
	private oramaDB: Orama<MySchema> | null = null;
	private settings: any; // Store settings
	private isIndexing: boolean = false; // Flag to prevent concurrent indexing
	private cleanupCallbacks: (() => void)[] = []; // For cleaning up timeouts/intervals

	constructor(private app: App, port: number, settings: any) {
		this.port = port;
		this.settings = settings;

		if (!settings.apiKey) {
			// Prevent server start if API key is essential
			throw new Error(
				"API key is not defined in settings. Please configure the API key in the plugin settings."
			);
		}

		this.server = new FastMCP({
			name: "Obsidian MCP Server",
			version: "1.0.0",
		});

		this.setupTools();
		// Load the DB initially when the server starts
		this.initializeOramaDB().catch((error) => {
			console.error("Failed initial OramaDB load:", error);
			new Notice(`Failed to load OramaDB on startup: ${error.message}`);
		});
	}

	// Initial load or creation of the database for the server instance
	async initializeOramaDB() {
		this.oramaDB = await oramaOperations.initializeOramaDB(
			this.app,
			this.settings
		);
		return this.oramaDB;
	}

	// Method to force reload the DB instance held by this server
	async reloadOramaDBInstance() {
		this.oramaDB = await oramaOperations.reloadOramaDBInstance(
			this.app,
			this.settings
		);
		return this.oramaDB;
	}

	start() {
		try {
			// Setup error handler before starting
			this.server.on("error", (error) => {
				console.error("MCP Server error:", error);
				// Don't show notice for timeout errors to avoid spamming user
				if (error.code !== -32001) {
					new Notice(`MCP Server error: ${error.message}`);
				}
			});

			this.server.start({
				transportType: "sse",
				sse: {
					endpoint: "/sse",
					port: this.port,
				},
			});
		} catch (error) {
			console.error("Error starting MCP server:", error);
			new Notice(
				`Error starting MCP server on port ${this.port}. See console for details.`
			);
			throw error; // Re-throw to allow caller to handle
		}
	}

	async setupTools() {
		this.server.addTool({
			name: "simple_vector_search",
			description:
				"Search the Orama database for notes semantically similar to a query and return results in simple text format.",
			parameters: z.object({
				query: z
					.string()
					.describe(
						"The search query. Please format this into a sentence."
					),
				count: z
					.number()
					.describe("The number of results to return. Defaults to 3.")
					.default(3),
				similarity: z
					.number()
					.describe(
						"The minimum similarity score for a result to be returned. Defaults to 0.6"
					)
					.default(0.6),
			}),
			execute: async (input: {
				query: string;
				count: number;
				similarity?: number;
			}) => {
				// Use the server's internal oramaDB instance
				if (!this.oramaDB) {
					return "Error: Orama database not initialized or loaded. Please try initializing/reloading.";
				}
				try {
					// Pass the server's DB instance to the search function
					const results = await vectorSearch(
						this.oramaDB,
						input,
						this.settings
					);

					// Format results as simple text with separator
					let output = "";
					results.forEach((doc: any, index: number) => {
						const content = doc.text || "No content available";
						output += `Document ${
							index + 1
						}\n${content}\n============\n`;
					});
					return output.trim();
				} catch (error: any) {
					console.error("Error performing vector search:", error);
					return `Error: Failed to perform vector search: ${error.message}`;
				}
			},
		});

		this.server.addTool({
			name: "count_entries",
			description:
				"Get the number of entries in the Orama database. Useful for understanding the size and scope of the indexed data.",
			parameters: z.object({}),
			execute: async () => {
				if (!this.oramaDB) {
					return JSON.stringify({
						error: "Orama database not initialized or loaded.",
					});
				}
				try {
					const count = await countEntries(this.oramaDB); // Use server's instance
					return JSON.stringify({ count });
				} catch (error: any) {
					console.error("Error counting entries:", error);
					return JSON.stringify({
						error: `Failed to count entries: ${error.message}`,
					});
				}
			},
		});

		// Add index vault command as a tool? Or keep as Obsidian command?
		// Let's keep it as an Obsidian command triggered via main.ts for now.
		// If needed as a tool:
		/*
        this.server.addTool({
            name: "index_vault",
            description: "Re-indexes the entire vault, clearing the previous index. Includes frontmatter.",
            parameters: z.object({}),
            execute: async () => {
                try {
                    await this.performIndexVault();
                    return JSON.stringify({ message: "Vault indexing initiated." });
                } catch (error: any) {
                    console.error("Error initiating vault indexing:", error);
					return JSON.stringify({ error: `Failed to initiate indexing: ${error.message}` });
                }
            }
        });
        */

		this.server.addTool({
			name: "list_files",
			description:
				"List files and sub-folders within the Obsidian vault. Root directory is `.`. Do not path traversal into parent folders.",
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the root of the Obsidian vault."
					),
			}),
			execute: async (input: { relative_path: string }) => {
				try {
					return await listFilesTool(this.app, input.relative_path);
				} catch (error) {
					console.error("Error listing files:", error);
					return JSON.stringify({
						error: "Failed to list files. See console for details.",
					});
				}
			},
		});

		this.server.addTool({
			name: "read_file",
			description:
				"Retrieve the content of a file within the Obsidian vault. Essential for examining file contents, extracting information, or making modifications.",
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the file to the root of the Obsidian vault."
					),
			}),
			execute: async (input: { relative_path: string }) => {
				try {
					return await readFileTool(this.app, input.relative_path);
				} catch (error) {
					console.error("Error reading file:", error);
					return JSON.stringify({
						error: "Failed to read file. See console for details.",
					});
				}
			},
		});

		this.server.addTool({
			name: "write_file",
			description:
				"Writes content to a file, creating directories if needed. Fail if file exists.", // Updated description
			parameters: z.object({
				relative_path: z
					.string()
					.describe(
						"Relative path to the file to the root of the Obsidian vault."
					),
				content: z.string().describe("Content to write to the file."),
			}),
			execute: async (input: {
				relative_path: string;
				content: string;
			}) => {
				try {
					// Assuming writeFileTool handles directory creation and overwriting
					return await writeFileTool(
						this.app,
						input.relative_path,
						input.content
					);
				} catch (error) {
					console.error("Error writing file:", error);
					return JSON.stringify({
						error: "Failed to write file. See console for details.",
					});
				}
			},
		});
	}

	stop() {
		try {
			// Run all cleanup callbacks
			this.cleanupCallbacks.forEach((cb) => cb());
			this.cleanupCallbacks = [];

			this.server.stop();
			// Also close the DB connection and stop persistence on server stop
			closeDatabase().catch((err) =>
				console.error("Error closing database on server stop:", err)
			);
		} catch (error) {
			console.error("Error stopping MCP server:", error);
			new Notice(`Error stopping MCP server. See console for details.`);
		}
	}

	async triggerSaveDb() {
		try {
			await oramaOperations.saveOramaDb(this.app, this.settings);
			new Notice("Orama DB saved manually.");
		} catch (error: any) {
			console.error("Error saving Orama DB:", error);
			new Notice(`Error saving Orama DB: ${error.message}`);
		}
	}
}

// Need to import vectorSearch function if it's defined elsewhere
import { vectorSearch } from "./tools/vector_search.js";
