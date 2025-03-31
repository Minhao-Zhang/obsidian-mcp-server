import { App, normalizePath } from "obsidian";

export async function readFileTool(
	app: App,
	relativePath: string
): Promise<string> {
	if (relativePath === "") {
		return JSON.stringify({ error: "File path cannot be empty." });
	}

	const normalizedPath = normalizePath(relativePath);
	const adapter = app.vault.adapter;

	try {
		const fileContent = await adapter.read(normalizedPath);
		return fileContent;
	} catch (error) {
		console.error("Error reading file:", error);
		return JSON.stringify({
			error: "Failed to read file. See console for details.",
		});
	}
}
