import { FastMCP } from "fastmcp";
import { z } from "zod"; // Revert to standard import
import { App, Notice } from "obsidian";
import { listFilesTool } from "./tools/list_files.js"; // Add .js extension
import { readFileTool } from "./tools/read_file.js"; // Add .js extension
import { writeFileTool } from "./tools/write_files.js"; // Add .js extension
import { getOramaDB, countEntries, saveDatabase } from "./orama-db.js"; // Add .js extension
import { getTextEmbeddings } from "./utils/embeddings.js"; // Add .js extension
import { insert } from "@orama/orama"; // Import Orama insert function
import { vectorSearch } from "./tools/vector_search.js";

export class MCPServer {
	private server: FastMCP;
	private port: number;
	private oramaDB: Awaited<ReturnType<typeof getOramaDB>> | null = null;
	private settings: any; // Store settings

	constructor(private app: App, port: number, settings: any) {
		// Accept settings
		this.port = port;
		this.settings = settings; // Store settings
		this.server = new FastMCP({
			name: "Obsidian MCP Server",
			version: "1.0.0",
		});

		this.setupTools();
		this.initializeOramaDB();
	}

	async initializeOramaDB() {
		try {
			// Pass app and stored settings
			this.oramaDB = await getOramaDB(this.app, this.settings);
		} catch (error: any) {
			console.error("Error initializing Orama database:", error);
			new Notice(`Error initializing Orama database: ${error.message}`);
		}
		await this.triggerSaveDb();
	}

	start() {
		try {
			this.server.start({
				transportType: "sse",
				sse: {
					endpoint: "/sse",
					port: this.port, // Use the port from settings
				},
			});
			console.log("MCP Server started successfully on port", this.port);
		} catch (error) {
			console.error("Error starting MCP server:", error);
			new Notice(
				`Error starting MCP server on port ${this.port}. See console for details.`
			);
		}
	}

	// Method to trigger manual save
	async triggerSaveDb() {
		const pluginDataDir = `${this.app.vault.configDir}/plugins/Obsidian-MCP-Server`;
		const filePath = `${pluginDataDir}/orama.msp`; // Use .msp extension
		try {
			await saveDatabase(this.app, filePath);
			console.log("Manual save triggered successfully.");
			// Optional: new Notice("Orama DB saved."); // Might be too noisy
		} catch (error: any) {
			console.error("Error triggering manual save:", error);
			new Notice(`Error saving Orama DB: ${error.message || error}`);
		}
	}

	async setupTools() {
		this.server.addTool({
			name: "vector_search",
			description: "Performs a vector search in the Orama database.",
			parameters: z.object({
				query: z.string().describe("The search query."),
				count: z
					.number()
					.describe("The number of results to return. Defaults to 5.")
					.default(5),
				similarity: z
					.number()
					.describe(
						"The minimum similarity score for a result to be returned. Defaults to 0.8"
					)
					.optional(),
			}),
			execute: async (input: {
				query: string;
				count: number;
				similarity?: number;
			}) => {
				if (!this.oramaDB) {
					return JSON.stringify({
						error: "Orama database not initialized. Please initialize the database first.",
					});
				}
				try {
					const results = await vectorSearch(
						this.oramaDB,
						input,
						this.settings
					);
					return JSON.stringify({ results });
				} catch (error: any) {
					console.error("Error performing vector search:", error);
					return JSON.stringify({
						error: `Failed to perform vector search. See console for details: ${error.message}`,
					});
				}
			},
		});

		this.server.addTool({
			name: "add_text_embedding",
			description:
				"Calculates embedding for input text and adds it to the Orama database.",
			parameters: z.object({
				text: z.string().describe("The text to add and embed."),
			}),
			execute: async (input: { text: string }) => {
				if (!this.oramaDB) {
					return JSON.stringify({
						error: "Orama database not initialized. Please initialize the database first using the 'init-orama-db' command.",
					});
				}
				if (!this.settings) {
					return JSON.stringify({
						error: "Plugin settings not available.",
					});
				}
				try {
					const [embedding] = await getTextEmbeddings(
						[input.text],
						this.settings
					);
					if (!embedding) {
						return JSON.stringify({
							error: "Failed to generate embedding.",
						});
					}
					const doc = {
						text: input.text,
						embedding: embedding,
						metadata: JSON.stringify({ source: "user_input" }), // Store metadata as string
					};
					// Add 'as any' to bypass strict type check for insert
					const id = await insert(this.oramaDB as any, doc);
					// Trigger save after successful insert
					await this.triggerSaveDb();
					return JSON.stringify({
						success: `Text added with ID: ${id}`,
					});
				} catch (error: any) {
					console.error("Error adding text embedding:", error);
					return JSON.stringify({
						error: `Failed to add text embedding. See console for details: ${error.message}`,
					});
				}
			},
		});

		this.server.addTool({
			name: "count_entries",
			description: "Counts the number of entries in the Orama database.",
			parameters: z.object({}),
			execute: async () => {
				try {
					if (!this.oramaDB) {
						return JSON.stringify({
							error: "Orama database not initialized. Please initialize the database first using the 'init-orama-db' command.",
						});
					}
					const count = await countEntries(this.oramaDB);
					return JSON.stringify({ count });
				} catch (error: any) {
					console.error("Error counting entries:", error);
					return JSON.stringify({
						error: `Failed to count entries. See console for details: ${error.message}`,
					});
				}
			},
		});

		this.server.addTool({
			name: "list_files",
			description:
				"List files and sub-folders for a given relative path to the root of the Obsidian vault.",
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
			description: "Returns the content of a file.",
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
				"Writes content to a file, but only if the file doesn't already exist.",
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
			this.server.stop();
			console.log("MCP Server stopped successfully");
		} catch (error) {
			console.error("Error stopping MCP server:", error);
			new Notice(`Error stopping MCP server. See console for details.`);
		}
	}
}
