import * as path from 'path';
import { workspace, ExtensionContext, commands, window } from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect-brk=6009'] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for javascript documents
        documentSelector: [{ scheme: 'file', language: 'javascript' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: [workspace.createFileSystemWatcher('**/compiled/meta/**/*.json')]
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'qooxdoo-lsp-client',
        'Qooxdoo LSP Client',
        serverOptions,
        clientOptions
    );


    context.subscriptions.push(
        commands.registerCommand("qxLsp.changeCompiledDir", async () => {
            const chosenFolder = await window.showWorkspaceFolderPick();
            if (!chosenFolder) return;
            try {
              await client.sendRequest("changeCompileDir", {uri: chosenFolder.uri});//!!
            } catch (e) {
              window.showErrorMessage("Failed to change compiler directory. Message: " + e)
              return;
            }
            window.showInformationMessage("Successfully changed compile directory.");
        })
    );

    context.subscriptions.push(
        commands.registerCommand("qxLsp.restartServer", async () => {
            await client.stop();
            await client.start();
            window.showInformationMessage("Language server successfully restarted");
        })
    );
    // Start the client. This will also launch the server
    client.start();
}