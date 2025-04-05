import { App, normalizePath, TFile } from "obsidian";

export async function readFileTool(
	app: App,
	relativePath: string,
	lineNumber?: boolean // Add optional line_number parameter
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

		if (lineNumber) {
			const lines = fileContent.split("\n");
			const lineCount = lines.length;
			// Determine padding based on the number of lines
			const padding = lineCount > 99 ? 3 : lineCount > 9 ? 2 : 1;
			// Format lines with padded numbers
			const numberedLines = lines.map((line, index) => {
				const num = (index + 1).toString().padStart(padding, "0");
				return `${num} | ${line}`;
			});
			return numberedLines.join("\n");
		} else {
			// Return raw content if line_number is false or undefined
			return fileContent;
		}
	} catch (error) {
		console.error("Error reading file:", error);
		return JSON.stringify({
			error: "Failed to read file. See console for details.",
		});
	}
}
