// @ts-nocheck
import { create, Orama, insert, count } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import { App, TFile, Notice } from "obsidian";
import { Buffer } from "buffer";
import { getTextEmbeddings } from "./utils/embeddings.js";

export interface MySchema {
	text: string;
	embedding: string;
	metadata: string; // Changed from MetadataType to string
	file_path: string;
}

// MetadataType interface is no longer needed for the schema definition
// export interface MetadataType {
// 	[key: string]: any;
// }

// Global variable for dimension, fetched once
let embeddingDimension: number | null = null;

// Schema definition function - used internally
const getInternalDynamicSchema = () => {
	if (embeddingDimension === null) {
		throw new Error("Embedding dimension has not been fetched yet.");
	}
	return {
		text: "string",
		embedding: `vector[${embeddingDimension}]` as const,
		metadata: "string", // Define metadata as string in the schema
		file_path: "string",
	} as const;
};

let db: Orama<MySchema> | null = null; // Global singleton instance
let persistenceInterval: NodeJS.Timeout | null = null;
let isSaving = false; // Simple lock flag

// --- Persistence Functions ---

export function stopOramaPersistence() {
	if (persistenceInterval) {
		clearInterval(persistenceInterval);
		persistenceInterval = null;
		console.log("Orama persistence interval stopped.");
	}
}

export async function saveDatabase(app: App, filePath: string) {
	if (isSaving) {
		console.log("Save already in progress, skipping.");
		return;
	}
	if (!db) {
		console.warn(
			"Attempted to save global DB, but it's null. Skipping save."
		);
		return;
	}

	isSaving = true;
	console.log("Attempting to save global Orama database...");
	try {
		const persistedData = await persist(db, "binary");
		await app.vault.adapter.writeBinary(
			filePath,
			persistedData as ArrayBuffer
		);
		console.log("Global Orama database saved successfully to:", filePath);
	} catch (error) {
		console.error("Error persisting global Orama database:", error);
		new Notice(`Error saving Orama DB: ${error.message || error}`);
	} finally {
		isSaving = false;
	}
}

// --- Database Initialization and Access ---

async function loadOrCreateDatabase(
	app: App,
	settings: any
): Promise<Orama<MySchema>> {
	const pluginDataDir = `${app.vault.configDir}/plugins/Obsidian-MCP-Server`;
	const filePath = `${pluginDataDir}/orama.msp`;
	let needsInitialSave = false;
	let loadedDb: Orama<MySchema> | null = null;

	if (embeddingDimension === null) {
		console.log("Fetching embedding dimension in loadOrCreateDatabase...");
		try {
			const testEmbeddings = await getTextEmbeddings(["test"], settings);
			if (testEmbeddings && testEmbeddings[0]) {
				embeddingDimension = testEmbeddings[0].length;
				console.log(
					`Embedding dimension set to: ${embeddingDimension}`
				);
			} else {
				throw new Error("Failed to get test embeddings.");
			}
		} catch (embedError) {
			console.error(
				"Critical error fetching embedding dimension:",
				embedError
			);
			throw new Error(
				`Failed to fetch embedding dimension: ${embedError.message}`
			);
		}
	}

	const fileExists = await app.vault.adapter.exists(filePath);
	if (fileExists) {
		console.log("Database file exists, attempting to restore...");
		try {
			const rawData = await app.vault.adapter.readBinary(filePath);
			const nodeBuffer = Buffer.from(rawData);
			// Restore function might need the schema type hint if it changed
			loadedDb = (await restore("binary", nodeBuffer)) as Orama<MySchema>;
			console.log("Orama database restored successfully from file.");
		} catch (restoreError) {
			console.error(
				"Error restoring Orama database, will create a new one:",
				restoreError
			);
			loadedDb = null;
		}
	} else {
		console.log("Database file does not exist.");
	}

	if (!loadedDb) {
		console.log("Creating a new Orama database instance...");
		needsInitialSave = true;
		try {
			const schemaDefinition = getInternalDynamicSchema(); // Uses string for metadata
			loadedDb = await create<MySchema>({ schema: schemaDefinition });
			console.log("New Orama database created successfully.");
		} catch (createError) {
			console.error("Error creating new Orama database:", createError);
			throw new Error(
				`Failed to create new Orama database: ${createError.message}`
			);
		}
	}

	db = loadedDb; // Assign to global instance

	if (!persistenceInterval) {
		console.log("Setting up persistence interval.");
		if (needsInitialSave && db) {
			console.log(
				"Performing initial save for newly created database..."
			);
			await saveDatabase(app, filePath);
		}

		persistenceInterval = setInterval(
			() => saveDatabase(app, filePath),
			(settings.saveIntervalMinutes || 5) * 60 * 1000
		);
		console.log(
			`Persistence interval started (${
				settings.saveIntervalMinutes || 5
			} minutes).`
		);
	}

	if (!db) {
		throw new Error("Database instance could not be initialized.");
	}
	return db;
}

export async function getOramaDB(
	app: App,
	settings: any,
	forceReload: boolean = false
): Promise<Orama<MySchema> | null> {
	if (forceReload && db) {
		console.log(
			"Force reload requested. Closing current DB instance and stopping persistence."
		);
		stopOramaPersistence();
		db = null;
	}

	if (!db) {
		console.log(
			"No active DB instance or force reload. Loading or creating..."
		);
		try {
			db = await loadOrCreateDatabase(app, settings);
		} catch (error) {
			console.error("Failed to load or create database:", error);
			new Notice(`Failed to initialize Orama DB: ${error.message}`);
			db = null;
		}
	}
	return db;
}

export async function closeDatabase() {
	console.log("closeDatabase called.");
	stopOramaPersistence();
	if (db) {
		db = null;
		console.log("Global Orama database instance closed (set to null).");
	} else {
		console.log("No active global Orama database instance to close.");
	}
}

export async function countEntries(database: Orama<MySchema>): Promise<number> {
	if (!database) return 0;
	try {
		return await count(database);
	} catch (error) {
		console.error("Error counting entries:", error);
		return 0;
	}
}
