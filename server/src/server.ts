import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentSyncKind,
    InitializeResult,
    CompletionParams,
    integer,
    WorkspaceFolder,
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { Node, NodeType, QxDatabase } from "./db";
import { promises } from 'fs';

async function initDb(): Promise<void> {
    let projDir = await getQxProjDir();
    if (projDir)
    codeDb.initialize(projDir);
}

const codeDb = new QxDatabase();
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);


// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

async function getDocumentWorkspaceFolder(fileUri: string): Promise<string | undefined> {
  let folders = await connection.workspace.getWorkspaceFolders()
return folders?.map((folder) => folder.uri)
    .filter((fsPath) => fileUri?.startsWith(fsPath))[0];
}

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
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
    initDb();
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



connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'languageServerExample'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});


/**
 * 
 * @param source Source of file
 * @param index Zero-based character index on where to find the expression
 * @returns A member chain (i.e. thing1.thing2.thing3, ...) before the index if it exists, null if not.
 * 
 * This function is used to get the expression for which to show the autocomplete suggestions.
 */
function getMemberChainBefore(source: string, index: integer): string | null {
    let identifier = "[A-Za-z][A-Za-z_0-9]*"; //!todo underscore
    let memberChainRegex = new RegExp(`(${identifier}(\\.${identifier})*)(\\(.*\\))?\\.(${identifier})?`, "g");
    while (memberChainRegex.lastIndex <= index) {
        let matches : RegExpExecArray | null = memberChainRegex.exec(source);
        if (memberChainRegex.lastIndex == index) {
            return matches && matches[1];
        }
    }
    return null
}

/**
 * 
 * @param uri uri
 * @returns Converts uri to absolute file system path
 */
function uriToPath(uri: string): string {
    return uri.substring("file://".length);
}

/**
 * @returns The workspace folder with the Qooxdoo source. This folder must contain compile.json. Returns null if no such folder exists
 */
async function getQxProjDir(): Promise<string | null> {
    let folders = await connection.workspace.getWorkspaceFolders();
    if (!folders) return null;
    for(var f = 0; f < folders?.length; f++) {
        let folder: WorkspaceFolder = folders[f];
        let path = uriToPath(folder.uri);
        let files = await promises.readdir(path);
        if (files.indexOf("compile.json") >= 0) {
            return folder.uri;
        }
    }
    return null;
}



connection.onDidSaveTextDocument(initDb);

function toCompletionItemKind(nodeType: NodeType): CompletionItemKind {
    switch (nodeType) {
        case NodeType.CLASS: return CompletionItemKind.Class;
        case NodeType.STATIC_METHOD: case NodeType.METHOD: return CompletionItemKind.Method;
        case NodeType.MEMBER_VARIABLE:return CompletionItemKind.Variable;
        case NodeType.PACKAGE:return CompletionItemKind.Module;
        default: return CompletionItemKind.Text;
    }
}

connection.onCompletion(
    async (completionInfo: CompletionParams): Promise<CompletionItem[]> => {
        let document = documents.get(completionInfo.textDocument.uri);
        if (!document) return [];

        let caretCharacterIndex = document.offsetAt(completionInfo.position);
        let source = document.getText();

        let memberChain = getMemberChainBefore(source, caretCharacterIndex);
        if (memberChain) {
            if (codeDb.containsNode(memberChain)) {
                return codeDb.getNode(memberChain).children?.map(
                    (child: Node): CompletionItem => {
                        return { 
                            label: child.name ?? "",
                kind: toCompletionItemKind(child.type ?? NodeType.CLASS), 
                    }}
                ) ?? [];
            } else return []
        } else {
            return codeDb.classnames.map(classname => {return {label:classname, kind: CompletionItemKind.Class};});
        }
    }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = 'TypeScript details';
            item.documentation = 'TypeScript documentation';
        } else if (item.data === 2) {
            item.detail = 'JavaScript details';
            item.documentation = 'JavaScript documentation';
        }
        return item;
    }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();