// @ts-nocheck
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { App, Notice, TFile } from "obsidian"; // Added TFile
import { listFilesTool } from "./tools/list_files.js";
import { readFileTool } from "./tools/read_file.js";
import { writeFileTool } from "./tools/write_files.js";
import {
	getOramaDB,
	countEntries,
	saveDatabase, // Keep saveDatabase for potential manual saves? Or remove if index command handles all saving.
	closeDatabase,
} from "./orama-db.js";
import { getTextEmbeddings } from "./utils/embeddings.js";
import { create, insertMultiple, Orama, persist } from "@orama/orama"; // Added create, Orama, insertMultiple
import { persist as persistToFile } from "@orama/plugin-data-persistence"; // Renamed persist import
import type { MySchema } from "./orama-db"; // Added MySchema import
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; // Added TextSplitter
import { createRagignoreMatcher } from "./utils/ragignore"; // Added ragignore

// Global variable for dimension, fetch once within MCPServer scope? Or keep in command?
// Let's keep it local to the indexing command for now.
// let embeddingDimension: number | null = null;

export class MCPServer {
	private server: FastMCP;
	private port: number;
	// This holds the *active* DB instance used by tools
	private oramaDB: Orama<MySchema> | null = null;
	private settings: any; // Store settings
	private isIndexing: boolean = false; // Flag to prevent concurrent indexing

	constructor(private app: App, port: number, settings: any) {
		this.port = port;
		this.settings = settings;

		if (!settings.apiKey) {
			new Notice(
				"API key is not defined in settings. Please configure the API key in the plugin settings."
			);
			console.error("API key is not defined in settings.");
			// Consider preventing server start if API key is essential
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
		console.log("MCPServer: Initializing OramaDB connection...");
		try {
			// Get the DB instance (loads/creates/sets global and returns it)
			this.oramaDB = await getOramaDB(this.app, this.settings);
			if (this.oramaDB) {
				console.log("MCPServer: OramaDB loaded successfully.");
				const count = await countEntries(this.oramaDB);
				console.log(`MCPServer: Initial DB entry count: ${count}`);
			} else {
				console.error(
					"MCPServer: getOramaDB returned null during initialization."
				);
				new Notice("Failed to initialize OramaDB instance.");
			}
		} catch (error: any) {
			console.error(
				"MCPServer: Error initializing Orama database:",
				error
			);
			new Notice(`Error initializing Orama database: ${error.message}`);
			this.oramaDB = null; // Ensure it's null on error
		}
		// No need to trigger save here, getOramaDB handles initial save if needed
	}

	// Method to force reload the DB instance held by this server
	async reloadOramaDBInstance() {
		console.log("MCPServer: Reloading OramaDB instance...");
		try {
			this.oramaDB = await getOramaDB(this.app, this.settings, true); // forceReload = true
			if (this.oramaDB) {
				const count = await countEntries(this.oramaDB);
				console.log(
					`MCPServer: OramaDB reloaded successfully. New count: ${count}`
				);
				new Notice("Database reloaded successfully.");
			} else {
				console.error(
					"MCPServer: getOramaDB returned null during reload."
				);
				new Notice("Failed to reload OramaDB instance after indexing.");
			}
		} catch (error) {
			console.error(
				"MCPServer: Error reloading OramaDB instance:",
				error
			);
			new Notice(`Error reloading database: ${error.message}`);
			this.oramaDB = null; // Ensure it's null on error
		}
	}

	start() {
		try {
			this.server.start({
				transportType: "sse",
				sse: {
					endpoint: "/sse",
					port: this.port,
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

	// Method to trigger manual save of the *global* DB instance
	// Might be less relevant now indexing handles its own saving/reloading
	async triggerSaveDb() {
		const pluginDataDir = `${this.app.vault.configDir}/plugins/Obsidian-MCP-Server`;
		const filePath = `${pluginDataDir}/orama.msp`;
		try {
			// saveDatabase saves the global instance from orama-db.ts
			await saveDatabase(this.app, filePath);
			console.log("Manual save triggered successfully for global DB.");
			new Notice("Orama DB saved (manual trigger).");
		} catch (error: any) {
			console.error("Error triggering manual save:", error);
			new Notice(`Error saving Orama DB: ${error.message || error}`);
		}
	}

	// --- Indexing Logic (Moved from indexVaultCommand.ts) ---
	async performIndexVault(): Promise<void> {
		if (this.isIndexing) {
			new Notice("Indexing is already in progress.");
			console.log("Indexing already in progress, skipping request.");
			return;
		}
		this.isIndexing = true;
		new Notice("Starting vault indexing (clearing previous index)...");
		console.log("Starting vault indexing...");

		const ragignoreMatcher = createRagignoreMatcher(
			this.settings.ignorePatterns
		);
		const files: TFile[] = this.app.vault.getFiles();
		let indexedCount = 0;
		let localEmbeddingDimension: number | null = null; // Use local var for dimension

		const splitter = new RecursiveCharacterTextSplitter({
			chunkSize: this.settings.chunkSize,
			chunkOverlap: this.settings.chunkOverlap,
			separators: this.settings.separators,
		});

		let localDb: Orama<MySchema> | null = null; // Local DB instance for this indexing run

		try {
			const pluginDataDir = `${this.app.vault.configDir}/plugins/Obsidian-MCP-Server`;
			const filePath = `${pluginDataDir}/orama.msp`;

			// 1. Close any globally held DB instance
			await closeDatabase();
			console.log("Closed global DB instance (if any).");

			// 2. Delete the existing database file
			try {
				if (await this.app.vault.adapter.exists(filePath)) {
					await this.app.vault.adapter.remove(filePath);
					console.log(`Deleted existing database file: ${filePath}`);
				} else {
					console.log(
						`Database file not found, proceeding to create new: ${filePath}`
					);
				}
			} catch (removeError) {
				console.error(
					`Error removing existing database file ${filePath}:`,
					removeError
				);
				new Notice(
					`Error removing old database file: ${removeError.message}. Indexing might be incomplete.`
				);
			}

			// 3. Fetch embedding dimension
			console.log("Fetching embedding dimension...");
			try {
				const testEmbeddings = await getTextEmbeddings(
					["test"],
					this.settings
				);
				if (testEmbeddings && testEmbeddings[0]) {
					localEmbeddingDimension = testEmbeddings[0].length;
					console.log(
						`Embedding dimension set to: ${localEmbeddingDimension}`
					);
				} else {
					throw new Error(
						"Failed to get test embeddings to determine dimension."
					);
				}
			} catch (embedError) {
				console.error(
					"Error fetching embedding dimension:",
					embedError
				);
				new Notice(
					`Error fetching embedding dimension: ${embedError.message}. Cannot create database.`
				);
				this.isIndexing = false; // Release lock on error
				return;
			}

			// 4. Explicitly create a new database instance
			console.log("Creating new Orama database instance for indexing...");
			try {
				const schemaDefinition = {
					text: "string",
					embedding: `vector[${localEmbeddingDimension}]` as const,
					metadata: "string", // Store metadata as JSON string
					file_path: "string",
				};
				localDb = await create<MySchema>({ schema: schemaDefinition });
				console.log(
					"New Orama database instance created successfully."
				);
			} catch (createError) {
				console.error(
					"Error creating new Orama database instance:",
					createError
				);
				new Notice(
					`Error creating new database: ${createError.message}. Indexing aborted.`
				);
				this.isIndexing = false; // Release lock on error
				return;
			}

			// 5. Collect chunks and frontmatter
			const allChunks: {
				chunk: string;
				filePath: string;
				frontmatter: any;
			}[] = [];
			console.log("Collecting chunks and frontmatter...");
			for (const file of files) {
				if (
					file.extension !== "md" ||
					ragignoreMatcher(file.path) ||
					file.path.startsWith(".obsidian/")
				) {
					continue;
				}
				try {
					const fileContent = await this.app.vault.read(file);
					const cache = this.app.metadataCache.getFileCache(file);
					const frontmatter = cache?.frontmatter || {};
					const chunks = await splitter.splitText(fileContent);
					allChunks.push(
						...chunks.map((chunk) => ({
							chunk,
							filePath: file.path,
							frontmatter,
						}))
					);
				} catch (error) {
					console.error(
						`Error reading/processing file ${file.path}:`,
						error
					);
				}
			}
			console.log(`Collected ${allChunks.length} chunks.`);

			// 6. Process and insert chunks in batches
			console.log("Processing and inserting chunks...");
			const batchSize = this.settings.batchSize || 10;
			for (let i = 0; i < allChunks.length; i += batchSize) {
				const batch = allChunks.slice(i, i + batchSize);
				const batchTexts = batch.map((item) => item.chunk);
				try {
					const embeddings = await getTextEmbeddings(
						batchTexts,
						this.settings
					);
					if (embeddings && embeddings.length === batch.length) {
						const documents = batch.map((item, index) => ({
							text: item.chunk,
							embedding: embeddings[index],
							metadata: JSON.stringify(item.frontmatter), // Store as JSON string
							file_path: item.filePath,
						}));
						await insertMultiple(localDb, documents);
						indexedCount += batch.length;
					} else {
						console.warn(
							`Embeddings mismatch for batch starting at index ${i}.`
						);
					}
				} catch (error) {
					console.error(
						`Error inserting batch starting at index ${i}:`,
						error
					);
				}
			}

			// 7. Save the newly created and populated database
			if (localDb) {
				console.log("Saving the new database...");
				try {
					const persistedData = await persistToFile(
						localDb,
						"binary"
					); // Use renamed import
					await this.app.vault.adapter.writeBinary(
						filePath,
						persistedData as ArrayBuffer
					);
					console.log(
						"New database saved successfully to:",
						filePath
					);
					new Notice(
						`Indexing complete. Indexed ${indexedCount} chunks. Database saved.`
					);
				} catch (saveError) {
					console.error(
						"Error saving the newly indexed database:",
						saveError
					);
					new Notice(
						`Error saving database: ${saveError.message}. Indexing complete, but data not saved.`
					);
				}
			} else {
				console.error("Local database instance was null, cannot save.");
				new Notice(
					"Indexing finished, but database instance was invalid. Data not saved."
				);
			}
		} catch (error) {
			console.error("Critical error during vault indexing:", error);
			new Notice(
				`Error indexing vault: ${error.message || error}. See console.`
			);
		} finally {
			localDb = null; // Clear local instance
			console.log("Indexing command finished.");
			// Force reload the global DB instance for the server
			await this.reloadOramaDBInstance();
			this.isIndexing = false; // Release lock
		}
	}

	// --- Tool Setup ---
	async setupTools() {
		this.server.addTool({
			name: "vector_search",
			description: "Performs a vector search in the Orama database.",
			parameters: z.object({
				query: z.string().describe("The search query."),
				count: z
					.number()
					.describe("The number of results to return. Defaults to 3.")
					.default(3),
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
				// Use the server's internal oramaDB instance
				if (!this.oramaDB) {
					return JSON.stringify({
						error: "Orama database not initialized or loaded. Please try initializing/reloading.",
					});
				}
				try {
					// Pass the server's DB instance to the search function
					const results = await vectorSearch(
						this.oramaDB,
						input,
						this.settings
					);
					// Results metadata will be JSON strings, client needs to parse
					return JSON.stringify({ results });
				} catch (error: any) {
					console.error("Error performing vector search:", error);
					return JSON.stringify({
						error: `Failed to perform vector search: ${error.message}`,
					});
				}
			},
		});

		this.server.addTool({
			name: "count_entries",
			description: "Counts the number of entries in the Orama database.",
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
				"Writes content to a file, creating directories if needed. Overwrites if file exists.", // Updated description
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
			this.server.stop();
			console.log("MCP Server stopped successfully");
			// Also close the DB connection and stop persistence on server stop
			closeDatabase().catch((err) =>
				console.error("Error closing database on server stop:", err)
			);
		} catch (error) {
			console.error("Error stopping MCP server:", error);
			new Notice(`Error stopping MCP server. See console for details.`);
		}
	}
}

// Need to import vectorSearch function if it's defined elsewhere
import { vectorSearch } from "./tools/vector_search.js";
