import { App, TFile, normalizePath } from "obsidian";

export type CreateLinkParameters = {
	source_path: string;
	target_path: string;
	alias?: string;
	bidirectional?: boolean;
	create_target_if_missing?: boolean;
};

function stripMarkdownExtension(path: string): string {
	return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

function getBasename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts.length ? parts[parts.length - 1] : path;
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWikiLink(target: string, alias?: string): string {
	const trimmedAlias = alias?.trim();
	return trimmedAlias ? `[[${target}|${trimmedAlias}]]` : `[[${target}]]`;
}

function hasExistingWikiLink(content: string, target: string): boolean {
	const targetBasename = getBasename(target);

	const escapedTarget = escapeRegExp(target);
	const escapedBasename = escapeRegExp(targetBasename);

	const pattern = new RegExp(
		`\\[\\[(?:${escapedTarget}|${escapedBasename})(?:\\|[^\\]]+)?\\]\\]`,
		"u"
	);

	return pattern.test(content);
}

async function appendLinkIfMissing(
	app: App,
	file: TFile,
	target: string,
	alias?: string
): Promise<{ changed: boolean; link: string }> {
	const content = await app.vault.read(file);
	if (hasExistingWikiLink(content, target)) {
		return { changed: false, link: buildWikiLink(target, alias) };
	}

	const link = buildWikiLink(target, alias);
	const separator = content.length === 0 ? "" : content.endsWith("\n") ? "" : "\n";
	const updated = `${content}${separator}${link}\n`;
	await app.vault.modify(file, updated);

	return { changed: true, link };
}

export async function createLinkTool(
	app: App,
	params: CreateLinkParameters
): Promise<string> {
	const {
		source_path,
		target_path,
		alias,
		bidirectional = false,
		create_target_if_missing = false,
	} = params;

	if (!source_path?.trim()) {
		return JSON.stringify({ error: "source_path cannot be empty." });
	}
	if (!target_path?.trim()) {
		return JSON.stringify({ error: "target_path cannot be empty." });
	}

	const normalizedSourcePath = normalizePath(source_path.trim());
	const normalizedTargetPath = normalizePath(target_path.trim());

	const sourceAbstract =
		app.vault.getAbstractFileByPath(normalizedSourcePath);
	if (!sourceAbstract || !(sourceAbstract instanceof TFile)) {
		return JSON.stringify({
			error: `Source file not found: ${normalizedSourcePath}`,
		});
	}

	let targetAbstract = app.vault.getAbstractFileByPath(normalizedTargetPath);
	let targetCreated = false;

	if (!targetAbstract) {
		if (!create_target_if_missing) {
			return JSON.stringify({
				error: `Target file not found: ${normalizedTargetPath}`,
			});
		}

		await app.vault.create(normalizedTargetPath, "");
		targetCreated = true;
		targetAbstract = app.vault.getAbstractFileByPath(normalizedTargetPath);
	}

	if (!targetAbstract || !(targetAbstract instanceof TFile)) {
		return JSON.stringify({
			error: `Target file not found: ${normalizedTargetPath}`,
		});
	}

	const sourceLinkTarget = stripMarkdownExtension(normalizedSourcePath);
	const targetLinkTarget = stripMarkdownExtension(normalizedTargetPath);

	try {
		const sourceResult = await appendLinkIfMissing(
			app,
			sourceAbstract,
			targetLinkTarget,
			alias
		);

		let targetResult: { changed: boolean; link: string } | null = null;
		if (bidirectional) {
			targetResult = await appendLinkIfMissing(
				app,
				targetAbstract,
				sourceLinkTarget
			);
		}

		return JSON.stringify({
			success: true,
			source_path: normalizedSourcePath,
			target_path: normalizedTargetPath,
			link: sourceResult.link,
			source_updated: sourceResult.changed,
			target_updated: targetResult?.changed ?? false,
			bidirectional,
			target_created: targetCreated,
		});
	} catch (error: any) {
		console.error("Error creating link:", error);
		return JSON.stringify({
			error: `Failed to create link: ${error?.message || error}`,
		});
	}
}

