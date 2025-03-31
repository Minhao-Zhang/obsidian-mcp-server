import { App, normalizePath } from "obsidian";

export async function listFiles(
	app: App,
	relativePath: string
): Promise<string> {
	if (relativePath === "") {
		relativePath = ".";
	}
	const normalizedPath = normalizePath(relativePath);
	if (normalizedPath.contains("..")) {
		return JSON.stringify({
			error: "Invalid path: Path traversal is not allowed.",
		});
	}
	const adapter = app.vault.adapter;

	try {
		const files = await adapter.list(normalizedPath);
		const result = files.folders
			.map((folder) => folder + "/")
			.concat(files.files)
			.join("\n");
		return result;
	} catch (error) {
		console.error("Error listing files:", error);
		return JSON.stringify({
			error: "Failed to list files. See console for details.",
		});
	}
}
