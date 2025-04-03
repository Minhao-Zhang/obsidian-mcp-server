import { App, normalizePath, TFile } from "obsidian";

export async function readFileTool(
	app: App,
	relativePath: string
): Promise<string> {
	if (relativePath === "") {
		return JSON.stringify({ error: "File path cannot be empty." });
	}

	const normalizedPath = normalizePath(relativePath);

	try {
		const abstractFile = app.vault.getAbstractFileByPath(normalizedPath);
		if (!abstractFile || !(abstractFile instanceof TFile)) {
			return JSON.stringify({ error: "File not found." });
		}
		const fileContent = await app.vault.read(abstractFile);
		return fileContent;
	} catch (error) {
		console.error("Error reading file:", error);
		return JSON.stringify({
			error: "Failed to read file. See console for details.",
		});
	}
}
