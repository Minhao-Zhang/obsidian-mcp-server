import { Orama, search } from "@orama/orama";
import { MySchema } from "../orama-db";
import { getTextEmbeddings } from "../utils/embeddings";

interface VectorSearchInput {
	query: string;
	count: number;
}

interface VectorSearchResult {
	text: string;
	metadata: any;
}

interface Hit {
	document: {
		text: string;
		metadata: any;
	};
}

export async function vectorSearch(
	db: Orama<MySchema>,
	input: VectorSearchInput,
	settings: any
): Promise<VectorSearchResult[]> {
	const { query, count } = input;

	console.log("Settings:", settings);

	if (!settings.apiKey) {
		console.error("API key is not defined in settings.");
		return [];
	}

	const embeddings = await getTextEmbeddings([query], settings);

	console.log("Embeddings:", embeddings);

	const results = await search(db, {
		term: query,
		mode: "vector",
		vector: {
			value: embeddings[0],
			property: "embedding",
		},
		limit: count,
	});

	console.log("Results:", results);

	return results.hits.map((hit: Hit) => ({
		text: hit.document.text,
		metadata: hit.document.metadata,
	}));
}
