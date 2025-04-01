# Revised Plan for Dynamic File Change Tracking and Indexing in OramaDB

**Prioritized Approach: Basic Functionality First**

This plan prioritizes implementing the core indexing functionality with `.gitignore` filtering and a manual "Index All Files" command before tackling dynamic file change tracking.

## 1. Implement .gitignore Logic (Priority 1)

*   **Plugin Setting:** Add a text area in the plugin settings to allow users to input `.gitignore` patterns.
*   **"Copy from .gitignore" Button:** Implement a button next to the setting that, when clicked, reads the content of a `.gitignore` file (if it exists in the vault root) and copies it into the settings text area. Provide a default template in settings if no `.gitignore` file is found, ignoring common file types like images and PDFs.
*   **`.gitignore` Matching Function:** Create a utility function (e.g., in `src/utils/gitignore.ts`) that takes a file path and the `.gitignore` patterns from settings. Use a library like `ignore` to implement `.gitignore` logic.

## 2. Create "Index All Files" Command (Priority 2)

*   **New Command File:** Create a new file `src/commands/indexVaultCommand.ts` to house the command logic.
*   **Command Implementation:** Implement a command (e.g., `IndexVaultCommand`) that, when executed:
    *   Retrieves all files in the Obsidian vault using `app.vault.getFiles()`.
    *   Applies the `.gitignore` filtering logic to exclude files based on user settings.
    *   For each file that is not ignored:
        *   Reads the file content using `app.vault.read(file)`.
        *   Chunks the file content using a chunking strategy from `langchain-community`.
        *   Generates embeddings for each chunk using `getTextEmbeddings`.
        *   Inserts each chunk with its embedding and relevant metadata into the OramaDB.
    *   Displays a user notice indicating the completion of the indexing process.

## 3. Chunking Strategy using `langchain-community` (Priority 3)

*   **Integrate `langchain-community`:** Incorporate a suitable text chunking method from the `langchain-community` library within the `indexFile` function in `src/file-indexer.ts` (which will be called by the "Index All Files" command). We can start with a simple text splitter and refine it later if needed.

## 4. Defer Dynamic File Tracking (Deferred)

*   Postpone the implementation of real-time file change tracking using Obsidian vault events and interval-based indexing. We will focus on the manual "Index All Files" command first to establish the core indexing functionality.

## 5. Error Handling and User Feedback

*   **Error Handling:** Wrap OramaDB operations and embedding generation in `try...catch` blocks to handle potential errors.
*   **Logging:** Log errors to the console for debugging.
*   **User Notices:** Display non-intrusive notices to the user for significant events like database initialization, saving, and potential errors during indexing.

## 6. Testing

*   **Unit Tests:** Write unit tests for the `.gitignore` matching function and the file indexing functions in `src/file-indexer.ts`.
*   **Integration Tests:** Test the "Index All Files" command within Obsidian, verifying that files are correctly filtered by `.gitignore` logic and indexed in OramaDB.

## Revised Plan Diagram

```mermaid
graph LR
    A[Index All Files Command (src/commands/indexVaultCommand.ts)] --> B{Get All Files from Vault};
    B --> C{Apply .gitignore Filtering};
    C -- Non-Ignored File --> D{Read File Content};
    D --> E{Chunk Content (langchain-community)};
    E --> F{Generate Embeddings};
    F --> G[Insert into OramaDB];
    C -- Ignored File --> H[Skip];
    G --> I[Indexing Complete Notice];
    H --> J[Continue to Next File];

    subgraph "Chunking & Indexing"
    E & F & G
    end

    style G fill:#ccf,stroke:#333,stroke-width:2px
    style I fill:#f9f,stroke:#333,stroke-width:2px