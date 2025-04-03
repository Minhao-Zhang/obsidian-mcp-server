// @ts-nocheck
import { App, Notice, TFile } from "obsidian";
import * as fs from "fs";
import ObsidianMCPServer from "../../main";
import { MCPServer } from "../mcp-server"; // Import MCPServer type
import { createRagignoreMatcher } from "../../src/utils/ragignore";
import { getTextEmbeddings } from "../../src/utils/embeddings";
import {
	// getOramaDB is no longer called directly here for reload
	closeDatabase,
} from "../../src/orama-db";
import { create, insertMultiple, Orama } from "@orama/orama";
import { persist } from "@orama/plugin-data-persistence";
import type { MySchema } from "../../src/orama-db";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

// Global variable to store embedding dimension (fetch once)
let embeddingDimension: number | null = null;

// Updated signature to accept serverInstance
export async function indexVaultCommand(
	plugin: ObsidianMCPServer,
	serverInstance?: MCPServer // Accept optional server instance
): Promise<void> {
	const app = plugin.app;
	const settings = plugin.settings;
	new Notice("Starting vault indexing (clearing previous index)...");
	console.log("Starting vault indexing...");

	// Check if server instance is provided (needed for reload notification)
	if (!serverInstance) {
		console.warn(
			"indexVaultCommand called without serverInstance. Cannot notify server to reload DB."
		);
		// Decide if we should proceed or abort. Let's proceed but log warning.
		// new Notice("Warning: Indexing complete, but server may need manual restart to use new index.");
	}

	const ragignoreMatcher = createRagignoreMatcher(settings.ignorePatterns);

	const files: TFile[] = app.vault.getFiles();
	let indexedCount = 0;

	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: settings.chunkSize,
		chunkOverlap: settings.chunkOverlap,
		separators: settings.separators,
	});

	let db: Orama<MySchema> | null = null; // Local DB instance for this command

	try {
		const pluginDataDir = `${app.vault.configDir}/plugins/Obsidian-MCP-Server`;
		const filePath = `${pluginDataDir}/orama.msp`;

		// 1. Close any globally held DB instance
		await closeDatabase();
		console.log("Closed global DB instance (if any).");

		// 2. Delete the existing database file
		try {
			if (await app.vault.adapter.exists(filePath)) {
				await app.vault.adapter.remove(filePath);
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

		// 3. Fetch embedding dimension if not already fetched
		if (embeddingDimension === null) {
			console.log("Fetching embedding dimension...");
			try {
				const testEmbeddings = await getTextEmbeddings(
					["test"],
					settings
				);
				if (testEmbeddings && testEmbeddings[0]) {
					embeddingDimension = testEmbeddings[0].length;
					console.log(
						`Embedding dimension set to: ${embeddingDimension}`
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
				return;
			}
		}

		// 4. Explicitly create a new database instance with metadata as string
		console.log("Creating new Orama database instance for indexing...");
		try {
			const schemaDefinition = {
				text: "string",
				embedding: `vector[${embeddingDimension}]` as const,
				metadata: "string", // Use string type for metadata
				file_path: "string",
			};
			db = await create<MySchema>({ schema: schemaDefinition });
			console.log("New Orama database instance created successfully.");
		} catch (createError) {
			console.error(
				"Error creating new Orama database instance:",
				createError
			);
			new Notice(
				`Error creating new database: ${createError.message}. Indexing aborted.`
			);
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
				const fileContent = await app.vault.read(file);
				const cache = app.metadataCache.getFileCache(file);
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
		const batchSize = settings.batchSize || 10;
		for (let i = 0; i < allChunks.length; i += batchSize) {
			const batch = allChunks.slice(i, i + batchSize);
			const batchTexts = batch.map((item) => item.chunk);

			try {
				const embeddings = await getTextEmbeddings(
					batchTexts,
					settings
				);

				if (embeddings && embeddings.length === batch.length) {
					const documents = batch.map((item, index) => {
						const metadataString = JSON.stringify(item.frontmatter);
						return {
							text: item.chunk,
							embedding: embeddings[index],
							metadata: metadataString, // Store the JSON string
							file_path: item.filePath,
						};
					});

					await insertMultiple(db, documents);
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
		if (db) {
			console.log("Saving the new database...");
			try {
				const persistedData = await persist(db, "binary");
				await app.vault.adapter.writeBinary(
					filePath,
					persistedData as ArrayBuffer
				);
				console.log("New database saved successfully to:", filePath);
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
			console.error("Database instance was null, cannot save.");
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
		db = null; // Clear local instance
		console.log("Indexing command finished.");
		// Notify the server instance to reload its internal DB reference
		if (
			serverInstance &&
			typeof serverInstance.reloadOramaDBInstance === "function"
		) {
			console.log("Notifying server instance to reload its database...");
			try {
				await serverInstance.reloadOramaDBInstance();
				console.log("Server instance reload notification sent.");
			} catch (reloadError) {
				console.error(
					"Error calling reloadOramaDBInstance on server:",
					reloadError
				);
				new Notice(
					"Failed to notify server to reload database. Restart might be needed."
				);
			}
		} else {
			console.warn(
				"Cannot notify server instance to reload DB (instance not provided or method missing)."
			);
			new Notice(
				"Warning: Indexing complete, but server may need manual restart to use new index."
			);
		}
	}
}
