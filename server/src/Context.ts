/**
 * A context or state object for the language server.
 * Stores information such as info about the packages/classes in the project, references to other symbols, etc
 */

import { URI } from 'vscode-uri'
import { QxClassDb } from './QxClassDb'
import { regexes } from './regexes'
import { rfind } from './search'
import { Server } from './server'
import path = require('path')
import fs = require('fs/promises');
import { existsSync } from 'fs'


export interface TypeInfo {
	category: "qxPackage" | "qxClass" | "qxObject",
	typeName: string
}

export class Context {
	private _qxClassDb: QxClassDb = new QxClassDb()
	private static _instance: Context

	public get qxClassDb(): QxClassDb {
		return this._qxClassDb
	}

	public static getInstance(): Context {
		if (!this._instance) this._instance = new Context;
		return this._instance;
	}

	/**
	 * Returns the type of the expression (expression) in the source (source) at position (sourcePos)
	 */
	public async getExpressionType(source: string, sourcePos: number, expression: string): Promise<TypeInfo | null> {

		if (expression == "this") {
			var rgx = new RegExp(regexes.RGX_CLASSDEF, "g");
			let groups = rgx.exec(source);
			let className = groups?.at(1);
			if (!className) return null;
			return { category: "qxObject", typeName: className };
		}

		let classOrPackageInfo = await this.qxClassDb.getClassOrPackageInfo(expression);
		if (classOrPackageInfo) {
			switch (classOrPackageInfo.type) {
				case "class":
					return { category: "qxClass", typeName: expression };
				case "package":
					return { category: "qxPackage", typeName: expression };
				default:
			}
		}


		let rgxNew = new RegExp(regexes.OBJECT_EXPRN, 'g');
		var matches = rgxNew.exec(expression);
		let className;
		if (expression.startsWith("new ") && (className = matches?.[2])) {
			let classOrPackageInfo = await this.qxClassDb.getClassOrPackageInfo(className);
			if (!classOrPackageInfo) return null;
			if (classOrPackageInfo.type == "class") return { category: "qxObject", typeName: className };
		}

		let rgxIdentifier = new RegExp(regexes.IDENTIFIER);
		var matches = rgxIdentifier.exec(expression);
		if (matches?.[0]) {
			let varName = matches[0];
			let assignmentRegex = new RegExp(`${varName}\\s*=\\s*(${regexes.OBJECT_EXPRN})`, "g");
			let searchInfo = rfind(source, sourcePos, assignmentRegex);
			if (!searchInfo) return null;
			return this.getExpressionType(source, searchInfo.start, searchInfo.groups[1]);
		}

		return null;

	}

	async getSourceUriForClass(className: string): Promise<string | null> {
		let workspaceFolders = await Server.getInstance().getWorkspaceFolders();
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