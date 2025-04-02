// @ts-nocheck
import { App, Notice, TFile } from "obsidian";
import * as fs from "fs";
import ObsidianMCPServer from "../../main";
import { createRagignoreMatcher } from "../../src/utils/ragignore";
import { getTextEmbeddings } from "../../src/utils/embeddings";
import {
	getOramaDB,
	getDynamicSchema,
	SchemaType,
	saveDatabase,
} from "../../src/orama-db";
import { Document, Orama, insert } from "@orama/orama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MySchema } from "../../src/orama-db";

export async function indexVaultCommand(
	plugin: ObsidianMCPServer
): Promise<void> {
	const app = plugin.app;
	const settings = plugin.settings;

	const ragignoreMatcher = createRagignoreMatcher(settings.ignorePatterns);

	const files: TFile[] = app.vault.getFiles();
	let indexedCount = 0;

	console.log(settings.chunkSize, settings.chunkOverlap, settings.separators);

	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: settings.chunkSize,
		chunkOverlap: settings.chunkOverlap,
		separators: settings.separators,
	});

	try {
		const db = await getOramaDB(app, settings);

		if (!db) {
			new Notice("OramaDB not initialized. Please initialize it first.");
			return;
		}

		const pluginDataDir = `${app.vault.configDir}/plugins/Obsidian-MCP-Server`;
		const filePath = `${pluginDataDir}/orama.msp`;

		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}

		for (const file of files) {
			if (ragignoreMatcher(file.path)) {
				console.log(`Skipping ${file.path} due to .ragignore`);
				continue;
			}

			try {
				const fileContent = await app.vault.read(file);
				const chunks = await splitter.splitText(fileContent);

				for (const chunk of chunks) {
					const embeddings = await getTextEmbeddings(
						[chunk],
						settings
					);

					if (embeddings && embeddings.length > 0) {
						const embedding = embeddings[0];

						const metadata = {
							// Add more metadata as needed
						};

						const document: Document = {
							text: chunk,
							embedding: embedding,
							metadata: metadata,
							file_path: file.path,
						};

						await insert(db, document);
						indexedCount++;
					} else {
						console.warn(
							`Could not generate embedding for chunk in ${file.path}`
						);
					}
				}
			} catch (error) {
				console.error(`Error indexing file ${file.path}:`, error);
			}
		}

		new Notice(`Indexed ${indexedCount} chunks from the vault.`);

		// Explicitly save database after indexing
		await saveDatabase(app, filePath);
		new Notice("Database saved to persistent storage.");
	} catch (error) {
		console.error("Error indexing vault:", error);
		new Notice(`Error indexing vault: ${error}`);
	}
}
