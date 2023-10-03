const fs = require('fs').promises;
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {
    CompletionItem,
    CompletionParams,
    Connection,
    DefinitionParams,
    DidChangeConfigurationNotification,
    DidChangeWatchedFilesNotification,
    DidChangeWatchedFilesParams,
    FileChangeType,
    FileEvent,
    InitializeParams,
    InitializeResult,
    Location,
    ParameterInformation,
    ProposedFeatures,
    SignatureHelp,
    SignatureHelpParams,
    TextDocumentSyncKind,
    TextDocuments,
    WorkspaceFolder,
    createConnection,
    integer,
} from 'vscode-languageserver/node';
import { CompletionEngine } from './CompletionEngine';
import { ClassInfo, QxClassDb } from "./QxClassDb";
import { rfind } from './search';
import { Context, TypeInfo } from './Context';
import { uriToPath } from './files';
import { getClassNameFromSource, getObjectExpressionEndingAt } from './sourceTools';
import { regexes } from './regexes';
import { strings } from './strings';



export class Server {
    static instance: Server | null
    _connection: Connection | null = null

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

            const tryInitClassDb = async () => {
                const mainProjDir = await this.getQxProjDir();
                if (mainProjDir !== null) {
                    Context.getInstance().qxClassDb.initialize(mainProjDir);
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
                    Context.getInstance().qxClassDb.readClassJson(uriToPath(change.uri));
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


        connection.onSignatureHelp(async (params: SignatureHelpParams): Promise<SignatureHelp | null> => {

            let document = this.documents.get(params.textDocument.uri);
            if (!document) throw new Error("Text document is undefined!");
            let caretIndex: integer = document.offsetAt(params.position);

            let source: string = document.getText();

            let bracketPos = rfind(source, caretIndex, /\(/g)?.start;
            if (!bracketPos) throw new Error();

            //find parameter number. Count number of columns between opening '(' and ca
            let paramIndex = source.substring(bracketPos, caretIndex).split('').filter(c => c == ',').length;

            let objAndMethod = getObjectExpressionEndingAt(source, bracketPos);
            if (!objAndMethod) return null;

            var methodInfo, methodName;
            //check if objectandmethod is a class, in which case provide constructor params
            let classInfo;
            if (objAndMethod.startsWith("new ") && (classInfo = (await Context.getInstance().qxClassDb.getClassOrPackageInfo(objAndMethod.substring("new ".length)))?.info)) {
                methodInfo = classInfo?.construct;
                methodName = objAndMethod;
            } else {
                const tokens = objAndMethod.split('.');
                if (tokens.length < 2) return null;
                methodName = tokens.pop();
                if (!methodName) throw new Error();

                let object: string = tokens.join(".");
                let objectType: TypeInfo | null = await Context.getInstance().getExpressionType(source, caretIndex, object);
                if (!objectType) return null;


                let methodClass = objectType.typeName;
                if (!methodClass) throw new Error();

                // var classOrPackageInfo = await Context.getInstance().qxClassDb.getClassOrPackageInfo(methodClass);
                // if (!classOrPackageInfo) return null;
                // if (classOrPackageInfo.type != "class") return null;

                // let methodInfo;//: ClassInfo = classOrPackageInfo.info;
                //if the member is inherited, look in the class where it was inherited from
                while (true) {
                    let classInfo = (await Context.getInstance().qxClassDb.getClassOrPackageInfo(methodClass))?.info;
                    if (!classInfo) return null;
                    methodInfo = classInfo.members?.[methodName] ?? classInfo.statics?.[methodName];
                    if (!methodInfo) {
                        methodClass = methodInfo?.overriddenFrom ?? classInfo?.superClass;
                    }
                    else {
                        break;
                    }

                }

                if (!methodInfo || methodInfo.type != "function") return null;

            }


            let paramList = methodInfo?.jsdoc?.["@param"];

            if (!paramList) return null;

            var paramLabels: string[] = [];

            let parameters: ParameterInformation[] = [];

            for (const paramInfo of paramList) {
                const paramLabel = paramInfo.paramName + ": " + paramInfo.type ?? "any";
                paramLabels.push(paramLabel);
                parameters.push({
                    label: paramLabel,
                    documentation: paramInfo.description ?? paramInfo.desc
                });
            }

            let signatureStr = `${methodName}(${paramLabels.join(',')})`;

            return signatureStr ? {
                signatures: [
                    {
                        label: signatureStr,
                        documentation: methodInfo.jsdoc?.["@description"].body,
                        parameters
                    }
                ],
                activeSignature: 0,
                activeParameter: paramIndex

            } : null;
        })
        connection.onDefinition(async (params: DefinitionParams): Promise<Location[] | null> => {
            let context = Context.getInstance();
            let document = this.documents.get(params.textDocument.uri);
            if (!document) throw new Error("Text document is undefined!");
            let caretIndex: integer = document.offsetAt(params.position);

            let source: string = document.getText();

            //find number of characters til the end of word
            var t = source.substring(caretIndex);
            let matches = (/\w*/).exec(t);
            let tilEow = matches?.[0]?.length;
            if (tilEow == null) throw new Error();
            let endOfWordPos: number = caretIndex + tilEow;

            let expr = getObjectExpressionEndingAt(source, endOfWordPos);
            if (!expr) return null;
            if (expr.startsWith("new ")) expr = expr.substring("new ".length);

            //check for getwidget
            let getWidgetMatch = rfind(source, caretIndex, /\.get((widget)|(childcontrol)|(qxobject))\("\w+/gi);
            if (getWidgetMatch && getWidgetMatch.end == caretIndex) {
                let widgetId = expr;
                let getWidgetExprn = getObjectExpressionEndingAt(source, getWidgetMatch.start);
                let objectClassName = getWidgetExprn && (await context.getExpressionType(source, caretIndex, getWidgetExprn))?.typeName
                let searchDocumentClassInfo: ClassInfo | null = objectClassName == null ? null : (await Context.getInstance().qxClassDb.getClassOrPackageInfo(objectClassName))?.info;
                let searchDocumentUri = objectClassName == null ? null : await context.getSourceUriForClass(objectClassName);
                let searchDocument = searchDocumentUri == null ? null : documents.get(searchDocumentUri);
                let searchSource = searchDocument?.getText();
                if (!searchSource) return null;

                /**class info json */
                while (true) {
                    if (!(searchSource && searchDocument?.uri)) throw new Error();

                    let caseMatch = searchSource.search(`case "${widgetId}":`);
                    if (caseMatch != -1) {
                        let caseLocation = searchDocument.positionAt(caseMatch);
                        return [
                            Location.create(searchDocument.uri, {
                                start: {
                                    line: caseLocation.line,
                                    character: caseLocation.character
                                },
                                end: caseLocation
                            })
                        ];
                    } else {
                        //go to parent class
                        let superClass = searchDocumentClassInfo?.superClass;
                        if (!superClass) break;
                        const classUri = await context.getSourceUriForClass(superClass);
                        if (!classUri) return null;
                        const searchDocumentUri = classUri; //todo improve this!
                        const searchDocumentMaybe: TextDocument | null = documents.get(searchDocumentUri) ?? null;
                        if (!searchDocumentMaybe) return null;
                        searchDocument = searchDocumentMaybe;
                        searchSource = searchDocument.getText();
                    }
                }
            }

            //check if it's a class
            var u = (await Context.getInstance().qxClassDb.getClassOrPackageInfo(expr));
            if (u && u.type != "class") return null;
            let classInfo = u?.info;
            if (classInfo) {
                let sourceUri = await context.getSourceUriForClass(expr);
                let start = classInfo.clazz.location.start;
                let end = classInfo.clazz.location.end;
                if (sourceUri) {
                    return [
                        Location.create(sourceUri, { start: { line: start.line, character: start.column }, end: { line: end.line, character: end.column } })
                    ];
                }
            } else { // it means it's a member of a class
                if (!expr || expr.split('').indexOf('.') == -1) return null;
                let t = expr.split('.');
                let memberName: string | null = t.pop() ?? null;
                if (!memberName) return null;
                let objectExpr = t?.join('.');
                if (!objectExpr) throw new Error;
                if (objectExpr == "this") {
                    let t = new RegExp(regexes.RGX_CLASSDEF).exec(source)?.at(1);
                    if (!t) return null; //todo complain
                    objectExpr = t;
                };

                let type = await Context.getInstance().getExpressionType(source, caretIndex, objectExpr);
                if (!type) return null;


                let className = type.typeName;
                let location: any;
                let classInfo;

                //if the member is inherited, look in the class where it was inherited from
                while (true) {
                    if (!className) return null;
                    classInfo = (await Context.getInstance().qxClassDb.getClassOrPackageInfo(className))?.info;
                    if (!classInfo) return null;
                    let memberInfo = classInfo.members?.[memberName] ?? classInfo.statics?.[memberName];
                    location = memberInfo?.location;
                    if (!location) {
                        let matches = /((get)|(set))(\w+)/.exec(memberName);
                        if (matches && matches[4]) {
                            let propertyName: string = strings.firstDown(matches[4]);
                            let propertyInfo: any = classInfo.properties?.[propertyName];
                            location = propertyInfo?.location;
                            if (location) break;
                        }
                    }

                    if (!location) {
                        className = memberInfo?.overriddenFrom ?? classInfo?.superClass;
                    }
                    else {
                        break;
                    }

                }

                let sourceUri = await context.getSourceUriForClass(className);
                if (!sourceUri) return null;
                return [
                    Location.create(sourceUri, {
                        start: {
                            line: location.start.line,
                            character: location.start.column
                        },
                        end: {
                            line: location.end.line,
                            character: location.end.column

                        }
                    })
                ];
            }

            return null;
        })

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

    public get documents() {
        return this._documents;
    }

    public async getWorkspaceFolders(): Promise<WorkspaceFolder[] | null> {
        return this._connection?.workspace.getWorkspaceFolders() ?? null;
    }
}

Server.getInstance().start();
