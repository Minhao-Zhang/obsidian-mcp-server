import { App } from "obsidian";
import { Orama } from "@orama/orama";
import { getOramaDB, countEntries } from "../orama-db";
import { Notice } from "obsidian";

// Define a type for the translation function signature
type TFunction = (key: string, params?: Record<string, string>) => string;

export interface OramaOperations {
	initializeOramaDB: (
		app: App,
		settings: any,
		t: TFunction // Add t function parameter
	) => Promise<Orama<any> | null>;
	reloadOramaDBInstance: (
		app: App,
		settings: any,
		t: TFunction // Add t function parameter
	) => Promise<Orama<any> | null>;
}

export const oramaOperations: OramaOperations = {
	async initializeOramaDB(
		app: App,
		settings: any,
		t: TFunction // Receive t function
	): Promise<Orama<any> | null> {
		try {
			const oramaDB = await getOramaDB(app, settings, false, t);
			if (oramaDB) {
				await countEntries(oramaDB);
				return oramaDB;
			} else {
				console.error(
					"OramaOperations: getOramaDB returned null during initialization."
				);
				new Notice(t("orama.initFailedInstance"));
				return null;
			}
		} catch (error: any) {
			console.error(
				"OramaOperations: Error initializing Orama database:",
				error
			);
			new Notice(t("orama.initError", { error: error.message }));
			return null;
		}
	},

	async reloadOramaDBInstance(
		app: App,
		settings: any,
		t: TFunction // Receive t function
	): Promise<Orama<any> | null> {
		try {
			const oramaDB = await getOramaDB(app, settings, true, t);
			if (oramaDB) {
				await countEntries(oramaDB);
				new Notice(t("orama.reloadSuccess"));
				return oramaDB;
			} else {
				console.error(
					"OramaOperations: getOramaDB returned null during reload."
				);
				new Notice(t("orama.reloadFailedInstance"));
				return null;
			}
		} catch (error: any) {
			console.error(
				"OramaOperations: Error reloading OramaDB instance:",
				error
			);
			new Notice(t("orama.reloadError", { error: error.message }));
			return null;
		}
	},
};
