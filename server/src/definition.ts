import { Location, TextDocument } from 'vscode-languageserver';
import { QxProjectContext } from './QxProjectContext';
import { ClassInfo } from './QxClassDb';
import { rfind } from './search';
import { getObjectExpressionEndingAt } from './sourceTools';
import { regexes } from './regexes';
import { strings } from './strings';
import { getExpressionType } from './getExpressionType';

/**
 * Implementation for finding a definition of a symbol
 * @param source Source code for file at which definition was requested
 * @param pos Zero-based index of cursor in source where definition was requested
 * @param context 
 * @returns 
 */
export async function findDefinitions(source: string, pos: number, context: QxProjectContext) {
	var t = source.substring(pos);
	let matches = (/\w*/).exec(t);
	let tilEow = matches?.[0]?.length;
	if (tilEow == null) throw new Error();
	let endOfWordPos: number = pos + tilEow;

	let expr = getObjectExpressionEndingAt(source, endOfWordPos);
	if (!expr) return null;
	if (expr.startsWith("new ")) expr = expr.substring("new ".length);

	//check for getwidget
	let getWidgetMatch = rfind(source, pos, /\.get((widget)|(childcontrol)|(qxobject))\("\w+/gi);
	if (getWidgetMatch && getWidgetMatch.end == pos) {
		let widgetId = expr;
		let getWidgetExprn = getObjectExpressionEndingAt(source, getWidgetMatch.start);
		let objectClassName = getWidgetExprn && (await getExpressionType(source, pos, getWidgetExprn, context))?.typeName
		let searchDocumentClassInfo: ClassInfo | null = objectClassName == null ? null : (await context.qxClassDb.getClassOrPackageInfo(objectClassName))?.info;
		let searchDocumentUri = objectClassName == null ? null : await context.getSourceUriForClass(objectClassName);
		let searchDocument = searchDocumentUri == null ? null : context.projectDocumentsManager.get(searchDocumentUri);
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
				const searchDocumentMaybe: TextDocument | null = context.projectDocumentsManager.get(searchDocumentUri) ?? null;
				if (!searchDocumentMaybe) return null;
				searchDocument = searchDocumentMaybe;
				searchSource = searchDocument.getText();
			}
		}
	}

	//check if it's a class
	var u = (await context.qxClassDb.getClassOrPackageInfo(expr));
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

		let type = await getExpressionType(source, pos, objectExpr, context);
		if (!type) return null;


		let className = type.typeName;
		let location: any;
		let classInfo;

		//if the member is inherited, look in the class where it was inherited from
		while (true) {
			if (!className) return null;
			classInfo = (await context.qxClassDb.getClassOrPackageInfo(className))?.info;
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
}