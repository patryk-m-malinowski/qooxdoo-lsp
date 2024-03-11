import { QxClassDb } from './QxClassDb'
import path = require('path')
import { existsSync } from 'fs'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { Connection, TextDocuments } from 'vscode-languageserver'

/**
 * A context or state object for the Qooxdoo project.
 * Stores information such as info about the packages/classes in the Qooxdoo project, the source files, references to other symbols (to be implemented), etc
 */
export class QxProjectContext {
	/** The class database, storing information about all the Qooxdoo classes found in the project	 */
	public qxClassDb: QxClassDb = new QxClassDb()

	/** Documents manager for the source files of the Qooxdoo project	 */
	public projectDocumentsManager: TextDocuments<TextDocument>;
	/** Connection object for the LSP connection */
	private __serverConnection: Connection;

	constructor(connection: Connection, documentManager: TextDocuments<TextDocument>) {
		this.__serverConnection = connection;
		this.projectDocumentsManager = documentManager;
	}

	/**
	 * Returns the URI for the source file of a class in the Qx project
	 */
	async getSourceUriForClass(className: string): Promise<string | null> {
		let workspaceFolders = await this.__serverConnection.workspace.getWorkspaceFolders();
		if (!workspaceFolders) throw new Error;
		for (const folder of workspaceFolders) {
			let folderPath = folder.uri.substring("file://".length);
			let sourceFile = path.join(folderPath, "source/class", className.split('.').join("/")) + ".js";
			if ((existsSync(sourceFile)))
				return "file://" + sourceFile;
		}
		return null;

	}
}