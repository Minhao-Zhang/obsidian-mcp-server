// @ts-nocheck
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { App, Notice } from "obsidian";
import { listFilesTool } from "./tools/list_files.js";
import { readFileTool } from "./tools/read_file.js";
import { createFileTool } from "./tools/create_files.js";
import { createLinkTool } from "./tools/create_link.js";
import { editFileTool, editFileParametersSchema } from "./tools/edit_file.js";
import { deleteFileTool } from "./tools/delete_file.js";
import { createFolderTool } from "./tools/create_folder.js"; // Added import for create_folder
import { deleteFolderTool } from "./tools/delete_folder.js";
import { oramaOperations } from "./utils/orama_operations.js";
import { countEntries, closeDatabase } from "./orama-db.js";
import { vectorSearch } from "./tools/vector_search.js";

// Define a type for the translation function signature
type TFunction = (key: string, params?: Record<string, string>) => string;

export class MCPServer {
	private server: FastMCP;
	private port: number;
	// This holds the *active* DB instance used by tools
	private oramaDB: Orama<MySchema> | null = null;
	private settings: any; // Store settings
	private isIndexing: boolean = false; // Flag to prevent concurrent indexing
	private cleanupCallbacks: (() => void)[] = []; // For cleaning up timeouts/intervals
	private t: TFunction; // Store translation function

	constructor(
		private app: App,
		port: number,
		settings: any,
		t: TFunction // Receive translation function
	) {
		this.port = port;
		this.settings = settings;
		this.t = t; // Store translation function

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
			new Notice(this.t("server.loadDbError", { error: error.message }));
		});
	}

	// Initial load or creation of the database for the server instance
	async initializeOramaDB() {
		this.oramaDB = await oramaOperations.initializeOramaDB(
			this.app,
			this.settings,
			this.t.bind(this) // Pass t function
		);
		return this.oramaDB;
	}

	// Method to force reload the DB instance held by this server
	async reloadOramaDBInstance() {
		this.oramaDB = await oramaOperations.reloadOramaDBInstance(
			this.app,
			this.settings,
			this.t.bind(this) // Pass t function
		);
		return this.oramaDB;
	}

	// Public method to safely get the count from the private DB instance
	async getOramaDbCount(): Promise<number | null> {
		if (!this.oramaDB) {
			console.warn(
				"Attempted to get count, but OramaDB is not initialized."
			);
			return null; // Or throw an error, depending on desired behavior
		}
		try {
			return await countEntries(this.oramaDB);
		} catch (error) {
			console.error("Error counting entries in getOramaDbCount:", error);
			return null; // Return null on error
		}
	}

	start() {
		try {
			// Setup error handler before starting
			this.server.on("error", (error) => {
				console.error("MCP Server error:", error);
				// Don't show notice for timeout errors to avoid spamming user
				if (error.code !== -32001) {
					new Notice(
						this.t("server.genericError", { error: error.message })
					);
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
			new Notice(this.t("server.startError", { port: this.port }));
			throw error; // Re-throw to allow caller to handle
		}
	}

	async setupTools() {
		if (this.settings.tools.simple_vector_search) {
			this.server.addTool({
				name: "simple_vector_search",
				description:
					"Searches your Obsidian Vault notes (indexed in Orama) for content semantically similar to your query. Returns matching note snippets. If results aren't relevant, try rephrasing your query or adjusting the `similarity` threshold (lower for broader matches, higher for stricter).",
				parameters: z.object({
					query: z
						.string()
						.describe(
							"The search query. Please format this into a sentence."
						),
					count: z
						.number()
						.describe(
							"The number of results to return. Defaults to 3."
						)
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
		}

		if (this.settings.tools.count_entries) {
			this.server.addTool({
				name: "count_entries",
				description:
					"Counts the number of indexed notes and chunks in your Obsidian Vault's Orama database. Useful for checking the indexing status or scope. If the count seems incorrect, consider re-indexing your vault.",
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
		}

		if (this.settings.tools.list_files) {
			this.server.addTool({
				name: "list_files",
				description:
					"Lists files and sub-folders within a specified directory of your Obsidian Vault. Use '.' for the vault root. If you don't see expected files, double-check the `relative_path` provided. Note: This tool cannot access folders outside the vault.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the root of the Obsidian vault."
						)
						.default("."),
				}),
				execute: async (input: { relative_path?: string }) => {
					try {
						return await listFilesTool(
							this.app,
							input.relative_path || "."
						);
					} catch (error) {
						console.error("Error listing files:", error);
						return JSON.stringify({
							error: "Failed to list files. See console for details.",
						});
					}
				},
			});
		}

		if (this.settings.tools.read_file) {
			this.server.addTool({
				name: "read_file",
				description:
					"Reads the full content of a specific note or file within your Obsidian Vault. Provide the `relative_path` from the vault root. Optionally, set `line_number` to true to prepend line numbers to each line. If the content seems wrong or the file isn't found, verify the path is correct and the file exists within the vault.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the file to the root of the Obsidian vault."
						),
					line_number: z // Add line_number parameter
						.boolean()
						.optional()
						.describe(
							"Whether to include line numbers in the output. Defaults to false."
						),
				}),
				execute: async (input: {
					relative_path: string;
					line_number?: boolean; // Add line_number to input type
				}) => {
					try {
						// Pass line_number to the tool function
						return await readFileTool(
							this.app,
							input.relative_path,
							input.line_number
						);
					} catch (error) {
						console.error("Error reading file:", error);
						return JSON.stringify({
							error: "Failed to read file. See console for details.",
						});
					}
				},
			});
		}

		if (this.settings.tools.create_file) {
			this.server.addTool({
				name: "create_file",
				description:
					"Creates a new file with the specified content at the given path within your Obsidian Vault. This tool will fail if a file already exists at the specified `relative_path`. Ensure the path is correct and points to a non-existent file location.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the file to the root of the Obsidian vault."
						),
					content: z
						.string()
						.describe("Content to write to the file."),
				}),
				execute: async (input: {
					relative_path: string;
					content: string;
				}) => {
					try {
						return await createFileTool(
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

		if (this.settings.tools.create_link) {
			this.server.addTool({
				name: "create_link",
				description:
					"Creates an Obsidian wikilink from one note to another (e.g., `[[Target]]`) to help build your knowledge graph. By default, this appends the link to the end of the source note and avoids duplicates. Optionally, set `bidirectional` to also add a backlink in the target note.",
				parameters: z.object({
					source_path: z
						.string()
						.describe(
							"Relative path to the source note (the note that will receive the link)."
						),
					target_path: z
						.string()
						.describe(
							"Relative path to the target note (the note being linked to)."
						),
					alias: z
						.string()
						.optional()
						.describe(
							"Optional alias text to display for the link (e.g., `[[Target|alias]]`)."
						),
					bidirectional: z
						.boolean()
						.optional()
						.default(false)
						.describe(
							"Whether to also create a backlink from the target note to the source note."
						),
					create_target_if_missing: z
						.boolean()
						.optional()
						.default(false)
						.describe(
							"Whether to create an empty target note if it does not exist."
						),
				}),
				execute: async (input: {
					source_path: string;
					target_path: string;
					alias?: string;
					bidirectional?: boolean;
					create_target_if_missing?: boolean;
				}) => {
					try {
						return await createLinkTool(this.app, {
							source_path: input.source_path,
							target_path: input.target_path,
							alias: input.alias,
							bidirectional: input.bidirectional,
							create_target_if_missing:
								input.create_target_if_missing,
						});
					} catch (error) {
						console.error("Error creating link:", error);
						return JSON.stringify({
							error: "Failed to create link. See console for details.",
						});
					}
				},
			});
		}

		if (this.settings.tools.edit_file) {
			this.server.addTool({
				name: "edit_file",
				description:
					"Edits a specific range of lines within a file in your Obsidian Vault. Replaces the content between `start_line` and `end_line` (inclusive) with the provided `new_content`. Use with caution. **Hint:** Use the `read_file` tool with `line_number: true` first to accurately identify the line numbers you need to edit.",
				parameters: editFileParametersSchema, // Use the imported schema
				execute: async (input: any) => {
					// Use 'any' for input type or infer from schema if possible with FastMCP
					try {
						// Validate input again just in case (FastMCP might do this)
						const validatedInput =
							editFileParametersSchema.parse(input);
						return await editFileTool(this.app, validatedInput);
					} catch (error: any) {
						console.error("Error editing file via tool:", error);
						// Handle Zod validation errors specifically if needed
						if (error instanceof z.ZodError) {
							return JSON.stringify({
								error: "Invalid parameters provided.",
								details: error.errors,
							});
						}
						return JSON.stringify({
							error: `Failed to execute edit_file tool: ${
								error.message || error
							}`,
						});
					}
				},
			});
		}

		if (this.settings.tools.delete_file) {
			this.server.addTool({
				name: "delete_file",
				description:
					"Deletes a file within your Obsidian Vault. Provide the `relative_path` from the vault root to the file you wish to delete. This tool permanently removes the specified file from your vault. Use with caution, as deleted files cannot be recovered unless you have a backup.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the file to the root of the Obsidian vault."
						),
				}),
				execute: async (input: { relative_path: string }) => {
					try {
						return await deleteFileTool(
							this.app,
							input.relative_path
						);
					} catch (error) {
						console.error("Error deleting file:", error);
						return JSON.stringify({
							error: "Failed to delete file. See console for details.",
						});
					}
				},
			});
		}

		if (this.settings.tools.create_folder) {
			this.server.addTool({
				name: "create_folder",
				description:
					"Creates a folder within your Obsidian Vault. Provide the `relative_path` from the vault root to the folder you wish to create. This tool creates a new folder at the specified path within your vault. If the folder already exists, this tool will return an error.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the folder to the root of the Obsidian vault."
						),
				}),
				execute: async (input: { relative_path: string }) => {
					try {
						await createFolderTool(this.app, input.relative_path);
						new Notice(
							this.t("server.folderCreated", {
								path: input.relative_path,
							})
						);
						return JSON.stringify({
							success: "Folder created successfully.",
						});
					} catch (error) {
						console.error("Error creating folder:", error);
						return JSON.stringify({
							error: "Failed to create folder. See console for details.",
						});
					}
				},
			});
		}

		if (this.settings.tools.delete_folder) {
			this.server.addTool({
				name: "delete_folder",
				description:
					"Deletes a folder within your Obsidian Vault. Provide the `relative_path` from the vault root to the folder you wish to delete. Optionally, set `force` to true to delete the folder even if it is not empty. This tool permanently removes the specified folder and all its contents from your vault. Use with extreme caution, as deleted folders and files cannot be recovered unless you have a backup.",
				parameters: z.object({
					relative_path: z
						.string()
						.describe(
							"Relative path to the folder to the root of the Obsidian vault."
						),
					force: z
						.boolean()
						.describe(
							"Whether to force delete the folder even if it is not empty."
						)
						.default(false),
				}),
				execute: async (input: {
					relative_path: string;
					force: boolean;
				}) => {
					try {
						return await deleteFolderTool(
							this.app,
							input.relative_path,
							input.force
						);
					} catch (error) {
						console.error("Error deleting folder:", error);
						return JSON.stringify({
							error: "Failed to delete folder. See console for details.",
						});
					}
				},
			});
		}
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
			new Notice(this.t("server.stopError"));
		}
	}

	async triggerSaveDb() {
		try {
			await oramaOperations.saveOramaDb(
				this.app,
				this.settings,
				this.t.bind(this)
			);
			new Notice(this.t("server.manualSaveSuccess"));
		} catch (error: any) {
			console.error("Error saving Orama DB:", error);
			new Notice(
				this.t("server.manualSaveError", { error: error.message })
			);
		}
	}

	async restartMCPServer() {
		this.stop();
		await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms
		this.start();
	}
}

// Need to import vectorSearch function if it's defined elsewhere
import { vectorSearch } from "./tools/vector_search.js";
