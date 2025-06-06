// @ts-nocheck
import { create, Orama, count } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import { App, Notice } from "obsidian";
import { getTextEmbeddings } from "./utils/embeddings.js";

export interface MySchema {
	text: string;
	embedding: string;
	metadata: string; // Changed from MetadataType to string
	file_path: string;
}

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
	}
}

export async function saveDatabase(app: App, filePath: string) {
	if (isSaving) {
		return;
	}
	if (!db) {
		console.warn(
			"Attempted to save global DB, but it's null. Skipping save."
		);
		return;
	}
	isSaving = true;
	try {
		await count(db);

		const persistedData = await persist(db, "json");
		await app.vault.adapter.write(filePath, persistedData as string);
	} catch (error) {
		// Log the error more explicitly here as well
		console.error(
			`Error during Orama persist/write for ${filePath}:`,
			error
		);
		// The original error logging remains:
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
	const pluginDataDir = `${app.vault.configDir}/plugins/mcp-server`;
	const filePath = `${pluginDataDir}/orama.json`;
	let needsInitialSave = false;
	let loadedDb: Orama<MySchema> | null = null;

	if (embeddingDimension === null) {
		try {
			const testEmbeddings = await getTextEmbeddings(["test"], settings);
			if (testEmbeddings && testEmbeddings[0]) {
				embeddingDimension = testEmbeddings[0].length;
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
		try {
			const rawData = await app.vault.adapter.read(filePath);
			// Restore function might need the schema type hint if it changed
			loadedDb = (await restore("json", rawData)) as Orama<MySchema>;
		} catch (restoreError) {
			console.error(
				"Error restoring Orama database, will create a new one:",
				restoreError
			);
			loadedDb = null;
		}
	}

	if (!loadedDb) {
		needsInitialSave = true;
		try {
			const schemaDefinition = getInternalDynamicSchema(); // Uses string for metadata
			loadedDb = await create<MySchema>({ schema: schemaDefinition });
		} catch (createError) {
			console.error("Error creating new Orama database:", createError);
			throw new Error(
				`Failed to create new Orama database: ${createError.message}`
			);
		}
	}

	db = loadedDb; // Assign to global instance

	if (!persistenceInterval) {
		if (needsInitialSave && db) {
			await saveDatabase(app, filePath);
		}

		persistenceInterval = setInterval(
			() => saveDatabase(app, filePath),
			(settings.saveIntervalMinutes || 5) * 60 * 1000
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
	forceReload: boolean = false,
	t?: TFunction // Optional t function
): Promise<Orama<MySchema> | null> {
	if (forceReload && db) {
		stopOramaPersistence();
		db = null;
	}

	if (!db) {
		try {
			db = await loadOrCreateDatabase(app, settings);
		} catch (error) {
			console.error("Failed to load or create database:", error);
			if (t) {
				new Notice(
					t("orama.initFailedNotice", { error: error.message })
				);
			} else {
				new Notice(`Failed to initialize Orama DB: ${error.message}`);
			}
			db = null;
		}
	}
	return db;
}

export async function closeDatabase() {
	stopOramaPersistence();
	if (db) {
		db = null;
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
