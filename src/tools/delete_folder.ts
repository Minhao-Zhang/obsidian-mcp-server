import { App, normalizePath, TFolder } from "obsidian";

export async function deleteFolderTool(
	app: App,
	relativePath: string,
	force: boolean
): Promise<string> {
	try {
		const normalizedPath = normalizePath(relativePath);
		const folder = app.vault.getAbstractFileByPath(normalizedPath);

		if (!folder || !(folder instanceof TFolder)) {
			return JSON.stringify({ error: "Folder does not exist." });
		}

		const children = folder.children;

		if (!force && children.length > 0) {
			return JSON.stringify({
				error: "Folder is not empty. Use force to delete anyway.",
			});
		}

		await app.vault.delete(folder, force);
		return JSON.stringify({ success: "Folder deleted successfully." });
	} catch (error: any) {
		console.error("Error deleting folder:", error);
		return JSON.stringify({
			error: `Failed to delete folder: ${relativePath}. ${error.message}`,
		});
	}
}
