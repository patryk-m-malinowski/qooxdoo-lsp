/**
 * A context or state object for the language server.
 * Stores information such as info about the packages/classes in the project, references to other symbols, etc
 */

import { QxClassDb } from './QxClassDb'
import { regexes } from './regexes'
import { rfind } from './search'

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
		if (expression.startsWith("new") && (className = matches?.[2])) {
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
}