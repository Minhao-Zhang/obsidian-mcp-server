import { create, Orama, insert, count } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence"; // Use base functions
import { App, TFile, Notice } from "obsidian"; // Import Notice
import { Buffer } from "buffer"; // Import Buffer for conversions
import { getTextEmbeddings } from "./utils/embeddings.js"; // Add .js extension
// Removed fs and path imports

// Remove OramaDB type alias - let type be inferred
// export type OramaDB = Orama<typeof schema>;

let embeddingDimension = 1536; // Default dimension

// Updated schema based on potentially fetched dimension
const getDynamicSchema = () =>
	({
		text: "string",
		embedding: `vector[${embeddingDimension}]`,
		metadata: "string",
	} as const);

// Remove schema constant used only for typing
// const schema = getDynamicSchema();

let db: Awaited<ReturnType<typeof create | typeof restore>> | null = null; // Use inferred type
let persistenceInterval: NodeJS.Timeout | null = null;
let isInitialized = false;
let isSaving = false; // Simple lock flag

// Export saveDatabase function
export async function saveDatabase(app: App, filePath: string) {
	if (isSaving) {
		console.log("Save already in progress, skipping.");
		return;
	}
	if (!db) {
		console.error("Attempted to save DB, but it's null.");
		return;
	}

	isSaving = true; // Acquire lock
	try {
		// Persist to binary format
		// Add 'as any' to bypass strict type check for persist argument
		const persistedData = await persist(db as any, "binary"); // Don't assume Buffer return type

		// Use adapter.writeBinary, assuming persistedData is ArrayBuffer or compatible
		// Add 'as ArrayBuffer' assertion for writeBinary parameter
		// Note: filePath is relative to vault root (e.g., .obsidian/plugins/...)
		await app.vault.adapter.writeBinary(
			filePath,
			persistedData as ArrayBuffer
		);
		// console.log("Orama database file saved using adapter.writeBinary.");
	} catch (error) {
		console.error(
			"Error persisting Orama database with adapter.writeBinary:",
			error
		);
		// Add Notice for visibility
		new Notice(`Error persisting Orama DB: ${error.message || error}`);
	} finally {
		isSaving = false; // Release lock
	}
}

// Renamed for clarity, accepts app and settings - Use inferred type for return
async function loadOrCreateDatabase(
	app: App,
	settings: any
): Promise<typeof db> {
	const pluginDataDir = `${app.vault.configDir}/plugins/Obsidian-MCP-Server`;
	const filePath = `${pluginDataDir}/orama.msp`; // Use .msp extension for binary
	let needsInitialSave = false;

	// Check if file exists using adapter.exists
	const fileExists = await app.vault.adapter.exists(filePath);

	// Try restoring first if file exists
	if (fileExists) {
		try {
			// Read binary data using adapter (returns ArrayBuffer)
			const rawData = await app.vault.adapter.readBinary(filePath);
			// Convert ArrayBuffer to Node.js Buffer for restore
			const nodeBuffer = Buffer.from(rawData);
			// Restore from binary data (Node.js Buffer) - Remove type assertion
			db = await restore("binary", nodeBuffer); // Assign to global db
			console.log(
				"Orama database restored from file using adapter.readBinary and restore"
			);
		} catch (restoreError) {
			console.error(
				"Error restoring Orama database using adapter.readBinary/restore, will create a new one:",
				restoreError
			);
			// fileExists is already known, just ensure db is null to trigger creation
			db = null;
		}
	}

	// If restore failed or file didn't exist, create new
	if (!db || !fileExists) {
		// This was the correct condition
		// If restore failed or file didn't exist, create new
		if (!db) {
			// Check specifically if db is null (restore failed or file didn't exist)
			console.log("Creating a new Orama database");
			needsInitialSave = true;
			try {
				// Fetch embedding dimension *before* creating
				const embeddings = await getTextEmbeddings(
					["This is a test."],
					settings
				);
				embeddingDimension = embeddings[0].length;

				// Create with updated schema - Remove type assertion
				db = await create({ schema: getDynamicSchema() }); // Assign to global db
				console.log("New Orama database created");
			} catch (createError) {
				console.error(
					"Error creating new Orama database:",
					createError
				);
				throw new Error(
					`Failed to create new Orama database: ${createError}`
				);
			}
		} // Close the inner if (!db) block here
	} // This closes the outer if (!db || !fileExists) block

	// Start persistence interval only once
	if (!persistenceInterval) {
		// Perform initial save immediately if needed
		if (needsInitialSave && db) {
			// Ensure db is created before saving
			await saveDatabase(app, filePath); // Save the newly created global db
		}

		// Set up interval for subsequent saves
		persistenceInterval = setInterval(
			() => saveDatabase(app, filePath), // Use the relative path for consistency
			5 * 60 * 1000
		); // 5 minutes
	}

	isInitialized = true;
	// This check ensures db is assigned. If creation failed, an error was thrown.
	if (!db) {
		throw new Error("Database instance could not be initialized.");
	}
	return db; // Return the global instance
}

// Accept app and settings - Use inferred type for return
export async function getOramaDB(app: App, settings: any): Promise<typeof db> {
	if (db && isInitialized) {
		return db;
	}
	// Load or create, this handles initialization and sets the global 'db'
	// This will also start the interval if not already started
	return await loadOrCreateDatabase(app, settings);
}

// Function to stop the persistence interval (e.g., on plugin unload)
export function stopOramaPersistence() {
	if (persistenceInterval) {
		clearInterval(persistenceInterval);
		persistenceInterval = null;
		console.log("Orama persistence stopped.");
	}
	// Optionally, trigger a final save on unload?
	// if (db) { saveDatabase(app, filePath, db); } // Need app context and db instance here
}

// Use inferred type for parameter
export async function countEntries(database: typeof db): Promise<number> {
	// Add 'as any' to bypass strict type check for count
	return count(database as any);
}
