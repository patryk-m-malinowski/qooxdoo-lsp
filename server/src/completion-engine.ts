import { CompletionItem, CompletionItemKind, CompletionParams, TextDocument, integer } from 'vscode-languageserver';
import { Node, NodeType } from './db';
import { Server } from './server';

const RGX_IDENTIFIER = "[A-Za-z][A-Za-z_0-9]*";
const RGX_MEMBER_CHAIN = `${RGX_IDENTIFIER}(\\.${RGX_IDENTIFIER})*`;
const RGX_CLASSDEF = /qx\.Class\.define\("(.+?)"/;

/**
 * This class manages the type suggestions logic
 */
export class CompletionEngine {
	/**
	 * Determines and returns the completion suggestions
	 * @param completionInfo Information regarding the context on which completion was requested
	 * @returns A list of all completion suggestions
	 */
	async getCompletionList(completionInfo: CompletionParams): Promise<CompletionItem[]> {
		const classDb = Server.getInstance().classDb;

		function getExpressionBeforeCaret(): string | null {
			let memberChainRegex = new RegExp(`(${RGX_IDENTIFIER}(\\.${RGX_IDENTIFIER})*)(\\(.*\\))?\\.(${RGX_IDENTIFIER})?`, "g");
			while (memberChainRegex.lastIndex <= caretCharacterIndex) {
				let matches: RegExpExecArray | null = memberChainRegex.exec(source);
				if (memberChainRegex.lastIndex == caretCharacterIndex) {
					return matches && matches[1];
				} else if (memberChainRegex.lastIndex == 0) return null;
			}
			return null
		}

		let document: TextDocument | undefined = Server.getInstance().documents.get(completionInfo.textDocument.uri);
		if (!document) throw new Error("Text document is undefined!");

		let caretCharacterIndex: integer = document.offsetAt(completionInfo.position);
		let source: string = document.getText();

		let exprn: string | null = getExpressionBeforeCaret();

		function toCompletionItem(child: Node) {
			let kind;
			switch (child.type) {
				case NodeType.CLASS: kind = CompletionItemKind.Class; break;
				case NodeType.STATIC_METHOD: case NodeType.METHOD: kind = CompletionItemKind.Method; break;
				case NodeType.MEMBER_VARIABLE: kind = CompletionItemKind.Variable; break;
				case NodeType.PACKAGE: kind = CompletionItemKind.Module; break;
				default: kind = CompletionItemKind.Text; break;
			}
			return {
				label: child.name ?? "",
				kind: kind,
			}
		}

		if (exprn) {
			if (classDb.containsNode(exprn)) {
				//if the expression is a fully-qualified name of a qx class
				return classDb.getNode(exprn).children?.map(
					toCompletionItem
				) ?? [];
			} else if (exprn == "this") {
				let groups = RGX_CLASSDEF.exec(source);
				let className = groups?.at(1);
				if (className) return classDb.getNode(className).children?.map(toCompletionItem) || [];
				else return []

			} else if (new RegExp(RGX_IDENTIFIER).test(exprn)) {				

				function getVariableDataType() {
					let assignmentRegex = new RegExp(`${exprn}\\s*=\\s*(new)?\\s+(${RGX_MEMBER_CHAIN})`);
					let matches: RegExpMatchArray | null = null;
					let previousLastIndex: integer = -1;
					while (assignmentRegex.lastIndex <= caretCharacterIndex) {
						matches = assignmentRegex.exec(source);
						if (!matches) break;
						if (matches && assignmentRegex.lastIndex == previousLastIndex)
							break;
						previousLastIndex = assignmentRegex.lastIndex;
					}

					return matches && matches[2];
				}
				let dataType = getVariableDataType();
				if (dataType && classDb.containsNode(dataType)) {
					return classDb.getNode(dataType).children?.map(
						toCompletionItem
					) ?? [];

				}
			}
			return [];

		} else {
			return classDb.classnames.map(classname => { return { label: classname, kind: CompletionItemKind.Class }; });
		}
	}
}