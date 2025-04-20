import { App, Notice, TFile } from "obsidian";

export async function deleteFileTool(
	app: App,
	relativePath: string
): Promise<string> {
	try {
		const file = app.vault.getAbstractFileByPath(relativePath);

		if (!file || !(file instanceof TFile)) {
			new Notice(`File not found in vault: ${relativePath}`);
			return JSON.stringify({
				error: `File not found in vault: ${relativePath}`,
			});
		}

		await app.vault.delete(file);
		new Notice(`File deleted: ${relativePath}`);
		return JSON.stringify({ success: `File deleted: ${relativePath}` });
	} catch (error: any) {
		console.error("Error deleting file:", error);
		new Notice(
			`Failed to delete file: ${relativePath}. See console for details.`
		);
		return JSON.stringify({
			error: `Failed to delete file: ${relativePath}. ${error.message}`,
		});
	}
}
