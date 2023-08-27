const fs = require('fs').promises;
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {
    CompletionItem,
    CompletionParams,
    Connection,
    DidChangeConfigurationNotification,
    DidChangeWatchedFilesNotification,
    DidChangeWatchedFilesParams,
    FileChangeType,
    FileEvent,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocumentSyncKind,
    TextDocuments,
    WorkspaceFolder,
    createConnection,
} from 'vscode-languageserver/node';
import { CompletionEngine } from './CompletionEngine';
import { QxClassDb } from "./QxClassDb";

/**
 * 
 * @param uri uri
 * @returns Converts uri to absolute file system path
 */
function uriToPath(uri: string): string {
    return uri.substring("file://".length);
}

export class Server {
    static instance: Server | null
    _connection: Connection | null = null
    _classDb: QxClassDb = new QxClassDb;
    private _documents = new TextDocuments(TextDocument);


    static getInstance(): Server {
        if (!this.instance) this.instance = new Server();
        return this.instance;
    }

    start() {

        // Create a connection for the server, using Node's IPC as a transport.
        // Also include all preview / proposed LSP features.
        const connection = this._connection = createConnection(ProposedFeatures.all);


        // Create a simple text document manager.
        const documents: TextDocuments<TextDocument> = this._documents;
        let hasConfigurationCapability = false;
        let hasWorkspaceFolderCapability = false;
        let hasDiagnosticRelatedInformationCapability = false;


        connection.onInitialize((params: InitializeParams) => {
            const capabilities = params.capabilities;

            // Does the client support the `workspace/configuration` request?
            // If not, we fall back using global settings.
            hasConfigurationCapability = !!(
                capabilities.workspace && !!capabilities.workspace.configuration
            );
            hasWorkspaceFolderCapability = !!(
                capabilities.workspace && !!capabilities.workspace.workspaceFolders
            );
            hasDiagnosticRelatedInformationCapability = !!(
                capabilities.textDocument &&
                capabilities.textDocument.publishDiagnostics &&
                capabilities.textDocument.publishDiagnostics.relatedInformation
            );

            const result: InitializeResult = {
                capabilities: {
                    textDocumentSync: TextDocumentSyncKind.Incremental,
                    // Tell the client that this server supports code completion.
                    completionProvider: {
                        resolveProvider: true,
                        triggerCharacters: ["."]

                    }
                }
            };
            if (hasWorkspaceFolderCapability) {
                result.capabilities.workspace = {
                    workspaceFolders: {
                        supported: true
                    }
                };
            }
            return result;
        });


        connection.onInitialized(() => {
            if (hasConfigurationCapability) {
                // Register for all configuration changes.
                connection.client.register(DidChangeConfigurationNotification.type, undefined);
                connection.client.register(DidChangeWatchedFilesNotification.type, undefined);
            }
            if (hasWorkspaceFolderCapability) {
                connection.workspace.onDidChangeWorkspaceFolders(_event => {
                    connection.console.log('Workspace folder change event received.');
                });
            }

            const tryInitClassDb = async () => {
                const mainProjDir = await this.getQxProjDir();
                if (mainProjDir !== null) {
                    this._classDb.initialize(mainProjDir);
                } else setTimeout(tryInitClassDb, 1000);
            }

            tryInitClassDb();
        });

        // The example settings
        interface ExampleSettings {
            maxNumberOfProblems: number;
        }

        // The global settings, used when the `workspace/configuration` request is not supported by the client.
        // Please note that this is not the case when using this server with the client provided in this example
        // but could happen with other clients.
        const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
        let globalSettings: ExampleSettings = defaultSettings;

        // Cache the settings of all open documents
        const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();


        connection.onDidChangeWatchedFiles((params: DidChangeWatchedFilesParams) => {
            params.changes.forEach((change: FileEvent) => {
                if (change.type == FileChangeType.Changed || change.type == FileChangeType.Created)
                    this._classDb.readClassJson(uriToPath(change.uri));
            })
        })

        connection.onDidChangeConfiguration(change => {
            if (hasConfigurationCapability) {
                // Reset all cached document settings
                documentSettings.clear();
            } else {
                globalSettings = <ExampleSettings>(
                    (change.settings.languageServerExample || defaultSettings)
                );
            }

        });

        // Only keep settings for open documents
        documents.onDidClose(e => {
            documentSettings.delete(e.document.uri);
        });

        const completionEngine = new CompletionEngine();
        connection.onCompletion(
            async (completionInfo: CompletionParams): Promise<CompletionItem[]> => {
                return completionEngine.getCompletionList(completionInfo);

            }
        );

        // This handler resolves additional information for the item selected in
        // the completion list.
        connection.onCompletionResolve(
            (item: CompletionItem): CompletionItem => {
                return item;
            }
        );

        // Make the text document manager listen on the connection
        // for open, change and close text document events
        documents.listen(connection);

        // Listen on the connection
        connection.listen();
    }

    /**
    * @returns The workspace folder with the Qooxdoo source. This folder must contain compile.json. Returns null if no such folder exists
    */
    async getQxProjDir(): Promise<string | null> {
        if (!this._connection) throw new Error("Connection cannot be null");
        let folders = await this._connection.workspace.getWorkspaceFolders();
        if (!folders) return null;
        for (var f = 0; f < folders?.length; f++) {
            let folder: WorkspaceFolder = folders[f];
            let path = uriToPath(folder.uri);
            let files = await fs.readdir(path);
            if (files.indexOf("compile.json") >= 0) {
                return uriToPath(folder.uri);
            }
        }
        return null;
    }

    public get classDb() {
        return this._classDb;
    }

    public get documents() {
        return this._documents;
    }
}

Server.getInstance().start();
