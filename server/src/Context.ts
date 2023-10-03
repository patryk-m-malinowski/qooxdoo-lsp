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
import acorn = require('acorn')

type Node = acorn.Node;

export interface TypeInfo {
	category: "qxPackage" | "qxClass" | "qxObject" | "function",
	typeName: string,
	parameterTypes?: TypeInfo[],
	returnType?: TypeInfo
}

function parse(exprn: string) {
	return acorn.parseExpressionAt(exprn, 0, { ecmaVersion: 6 });
}

function getSourceOfAst(ast: acorn.Node, source: string) {
	return source.substring(ast.start, ast.end);
}

function removeTemplateArgs(typeName: string) {
	return typeName.replace(/<.*>/, "");
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
		let ast: any = parse(expression); //todo improve this


		if (expression == "this") {
			var rgx = new RegExp(regexes.RGX_CLASSDEF, "g"); //todo use getclassnamefromfile
			let groups = rgx.exec(source);
			let className = groups?.at(1);
			if (!className) return null;
			return { category: "qxObject", typeName: className };
		} else if (ast.type == "MemberExpression") {
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

			//else
			let objectString = getSourceOfAst(ast.object, expression);

			let objectTypename = (await this.getExpressionType(source, sourcePos, objectString))?.typeName;
			if (!objectTypename) return null;
			let objectClassOrPackageInfo = await this.qxClassDb.getClassOrPackageInfo(objectTypename);
			if (!objectClassOrPackageInfo || objectClassOrPackageInfo?.info == "qxPackage") return null;

			let typeInfo = objectClassOrPackageInfo.info;
			let allMembers = { ...typeInfo.members, ...typeInfo.statics };
			const memberName = ast.property.name;
			const memberInfo = allMembers[memberName];
			if (!memberInfo) return null;
			if (memberInfo.type == "variable") {
				let typeInfo = memberInfo["@type"]?.[0].body;
				if (!typeInfo) return null;
				let typeMatch = /\{(.*)\}/.exec(typeInfo);
				if (!typeMatch) return null;
				let type: string = removeTemplateArgs(typeMatch[1]);
				if (await this.qxClassDb.getClassOrPackageInfo(type) == null) {
					return { category: "qxObject", typeName: type };
				} else return null;
			} else if (memberInfo.type == "function") {
				const returnTypeName = removeTemplateArgs(memberInfo["jsdoc"]?.["@return"]?.[0].type as string);
				const returnType: TypeInfo = { category: "qxObject", typeName: returnTypeName }; //todo change to object
				return returnType ? { category: "function", typeName: "", returnType: returnType } : null;
			}
		} else if (ast.type == "CallExpression") {
			let objectExprn: string = getSourceOfAst(ast.callee.object, expression);
			let objectTypeInfo: TypeInfo | null = await this.getExpressionType(source, sourcePos, objectExprn);
			if (!objectTypeInfo) return null;
			let propertyName: string = ast.callee.property.name;
			if (ast.callee.type == "MemberExpression" && objectTypeInfo.category == "qxObject" && propertyName == "set") {
				return objectTypeInfo;
			}
			let functionType = await this.getExpressionType(source, sourcePos, getSourceOfAst(ast.callee, expression));
			if (functionType?.category != "function") return null; //todo log error
			return functionType.returnType ?? null;
		} else if (ast.type == "NewExpression") {
			let className = getSourceOfAst(ast.callee, expression);
			if (!this.qxClassDb.classExists(className)) return null;
			return { category: "qxObject", typeName: className };
		} else if (ast.type == "Identifier") {
			let varName = expression;
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
