// @ts-nocheck
import { Notice, TFile, getFrontMatterInfo, FrontMatterCache } from "obsidian";
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
	let progressNotice: Notice | null = null;

	try {
		const pluginDataDir = `${app.vault.configDir}/plugins/obsidian-mcp-server`;
		const filePath = `${pluginDataDir}/orama.msp`;

		// 1. Close any globally held DB instance
		await closeDatabase();

		// 2. Delete the existing database file
		try {
			const existingFile = app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				if (existingFile instanceof TFile) {
					await app.vault.delete(existingFile);
				}
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
			try {
				const testEmbeddings = await getTextEmbeddings(
					["test"],
					settings
				);
				if (testEmbeddings && testEmbeddings[0]) {
					embeddingDimension = testEmbeddings[0].length;
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
		try {
			const schemaDefinition = {
				text: "string",
				embedding: `vector[${embeddingDimension}]` as const,
				metadata: "string", // Use string type for metadata
				file_path: "string",
			};
			db = await create<MySchema>({ schema: schemaDefinition });
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
			frontmatter: FrontMatterCache;
		}[] = [];
		for (const file of files) {
			if (
				file.extension !== "md" ||
				ragignoreMatcher(file.path) ||
				file.path.startsWith(app.vault.configDir + "/")
			) {
				continue;
			}

			try {
				let fileContent = await app.vault.read(file);
				const cache = app.metadataCache.getFileCache(file);
				const frontmatter = cache?.frontmatter || {};

				// Remove frontmatter from fileContent
				const frontmatterInfo = getFrontMatterInfo(fileContent);
				if (frontmatterInfo?.exists) {
					fileContent = fileContent.slice(
						frontmatterInfo.contentStart
					);
				}

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

		const totalChunks = allChunks.length;
		progressNotice = new Notice(
			`Starting indexing 0% (0/${totalChunks} chunks)...`,
			0
		); // 0 timeout = persistent

		// 6. Process and insert chunks in batches
		const batchSize = settings.batchSize || 10;
		for (let i = 0; i < totalChunks; i += batchSize) {
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

			// Update progress notice
			const processedChunks = Math.min(i + batchSize, totalChunks);
			const percentage =
				totalChunks > 0
					? Math.round((processedChunks / totalChunks) * 100)
					: 100;
			if (progressNotice) {
				progressNotice.setMessage(
					`Indexing... ${percentage}% (${processedChunks}/${totalChunks} chunks)`
				);
			}
		}

		// 7. Save the newly created and populated database
		if (db) {
			try {
				const persistedData = await persist(db, "binary");
				// Use writeBinary to overwrite the file if it exists
				await app.vault.adapter.writeBinary(
					filePath,
					persistedData as ArrayBuffer
				);
				// Update notice on successful save
				if (progressNotice) {
					progressNotice.setMessage(
						`Indexing complete. Indexed ${indexedCount} chunks. Database saved.`
					);
					// Hide after a short delay
					setTimeout(() => progressNotice.hide(), 5000);
				}
			} catch (saveError: any) {
				// Catch errors from persist() or writeBinary()
				// No need to specifically handle "File already exists" as writeBinary overwrites
				if (progressNotice) {
					progressNotice.setMessage(
						`Error saving database: ${saveError.message}. Indexing complete, but data not saved.`
					);
					// Hide after a delay
					setTimeout(() => progressNotice.hide(), 10000);
				}
				console.error(
					"Error saving the newly indexed database:",
					saveError
				);
			}
		} else {
			console.error("Database instance was null, cannot save.");
			if (progressNotice) {
				progressNotice.setMessage(
					"Indexing finished, but database instance was invalid. Data not saved."
				);
				// Hide after a delay
				setTimeout(() => progressNotice.hide(), 10000);
			}
		}
	} catch (error) {
		console.error("Critical error during vault indexing:", error);
		// Ensure notice is updated/hidden in case of critical error
		if (progressNotice) {
			progressNotice.setMessage(
				`Error indexing vault: ${error.message || error}. See console.`
			);
			setTimeout(() => progressNotice.hide(), 10000);
		} else {
			new Notice(
				`Error indexing vault: ${error.message || error}. See console.`
			);
		}
	} finally {
		// Ensure notice is hidden if it hasn't been already
		if (
			progressNotice &&
			progressNotice.noticeEl &&
			!progressNotice.noticeEl.hidden
		) {
			// Check if it's already hidden to avoid errors if timeout already fired
			setTimeout(() => progressNotice.hide(), 1000); // Short delay before final hide
		}
		db = null; // Clear local instance
		// Notify the server instance to reload its internal DB reference
		if (
			serverInstance &&
			typeof serverInstance.reloadOramaDBInstance === "function"
		) {
			try {
				await serverInstance.reloadOramaDBInstance();
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
