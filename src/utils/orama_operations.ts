import { App } from "obsidian";
import { Orama } from "@orama/orama";
import { getOramaDB, countEntries } from "../orama-db";
import { Notice } from "obsidian";

export interface OramaOperations {
	initializeOramaDB: (app: App, settings: any) => Promise<Orama<any> | null>;
	reloadOramaDBInstance: (
		app: App,
		settings: any
	) => Promise<Orama<any> | null>;
}

export const oramaOperations: OramaOperations = {
	async initializeOramaDB(
		app: App,
		settings: any
	): Promise<Orama<any> | null> {
		try {
			const oramaDB = await getOramaDB(app, settings);
			if (oramaDB) {
				const count = await countEntries(oramaDB);
				return oramaDB;
			} else {
				console.error(
					"OramaOperations: getOramaDB returned null during initialization."
				);
				new Notice("Failed to initialize OramaDB instance.");
				return null;
			}
		} catch (error: any) {
			console.error(
				"OramaOperations: Error initializing Orama database:",
				error
			);
			new Notice(`Error initializing Orama database: ${error.message}`);
			return null;
		}
	},

	async reloadOramaDBInstance(
		app: App,
		settings: any
	): Promise<Orama<any> | null> {
		try {
			const oramaDB = await getOramaDB(app, settings, true); // forceReload = true
			if (oramaDB) {
				const count = await countEntries(oramaDB);
				new Notice("Database reloaded successfully.");
				return oramaDB;
			} else {
				console.error(
					"OramaOperations: getOramaDB returned null during reload."
				);
				new Notice("Failed to reload OramaDB instance after indexing.");
				return null;
			}
		} catch (error: any) {
			console.error(
				"OramaOperations: Error reloading OramaDB instance:",
				error
			);
			new Notice(`Error reloading database: ${error.message}`);
			return null;
		}
	},
};
