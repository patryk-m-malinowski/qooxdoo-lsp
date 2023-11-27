const fs = require('fs').promises;
import {
  TextDocument
} from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionParams,
  DefinitionParams,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  DidChangeWatchedFilesParams,
  FileChangeType,
  FileEvent,
  InitializeParams,
  InitializeResult,
  Location,
  ProposedFeatures,
  SignatureHelp,
  SignatureHelpParams,
  TextDocumentSyncKind,
  TextDocuments,
  WorkspaceFolder,
  createConnection,
  integer
} from 'vscode-languageserver/node';
import { URI, uriToFsPath } from 'vscode-uri/lib/umd/uri';
import { QxProjectContext } from './QxProjectContext';
import { getCompletionSuggestions } from './completion';
import { findDefinitions } from './definition';
import { uriToPath } from './files';
import { getSignatureHint } from './signatureHelp';

function startServer() {

  // Create a connection for the server, using Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(ProposedFeatures.all);

  // Create a simple text document manager.
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
  const context: QxProjectContext = new QxProjectContext(connection, documents);
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

        },

        signatureHelpProvider: {
          triggerCharacters: ['(', ',']
        },

        definitionProvider: {

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

    const getQxProjDir = async (): Promise<string | null> => {
      if (!connection) throw new Error("Connection cannot be null");
      let folders = await connection.workspace.getWorkspaceFolders();
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

    const tryInitClassDb = async () => {
      const mainProjDir = await getQxProjDir();
      if (mainProjDir !== null) {
        context.qxClassDb.initialize(mainProjDir);
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
        context.qxClassDb.readClassJson(uriToPath(change.uri));
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

  connection.onCompletion(
    async (completionInfo: CompletionParams): Promise<CompletionItem[] | null> => {
      let document: TextDocument | undefined = documents.get(completionInfo.textDocument.uri);
      if (!document) throw new Error("Text document is undefined!");

      let offset: number = document.offsetAt(completionInfo.position);
      let source: string = document.getText();

      return getCompletionSuggestions(source, offset, context);

    }
  );

  // This handler resolves additional information for the item selected in
  // the completion list.
  connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
      return item;
    }
  );


  connection.onRequest("changeCompileDir", async (params: { uri: URI }) => {
    const dirPath = uriToFsPath(params.uri, false);
    try {
      context.qxClassDb.initialize(dirPath);
    } catch (e) {
      connection.sendNotification("Error processing compiled path.");
    }
  });


  connection.onSignatureHelp(async (params: SignatureHelpParams): Promise<SignatureHelp | null> => {

    let document = documents.get(params.textDocument.uri);
    if (!document) throw new Error("Text document is undefined!");
    let caretIndex: number = document.offsetAt(params.position);

    let source: string = document.getText();
    return getSignatureHint(source, caretIndex, context);

  })
  connection.onDefinition(async (params: DefinitionParams): Promise<Location[] | null> => {
    let document = documents.get(params.textDocument.uri);
    if (!document) throw new Error("Text document is undefined!");
    let caretIndex: integer = document.offsetAt(params.position);

    let source: string = document.getText();
    return findDefinitions(source, caretIndex, context);

    //find number of characters til the end of word

  });

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
}


startServer();
