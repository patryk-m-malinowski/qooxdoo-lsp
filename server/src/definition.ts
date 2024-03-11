import { Location, TextDocument } from 'vscode-languageserver';
import { QxProjectContext } from './QxProjectContext';
import { ClassInfo } from './ClassInfo';
import { rfind } from './rfind';
import { getObjectExpressionEndingAt } from './sourceTools';
import { parse, getSourceOfAst, Ast } from './parsing';
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
		let searchDocumentClassInfo: ClassInfo | null = objectClassName == null ? null : (await context.qxClassDb.getClassOrPackageInfo(objectClassName))?.info as any;
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
	let classInfo: ClassInfo | null = u?.info as any;
	if (classInfo) {
		let sourceUri = await context.getSourceUriForClass(expr);
		let start = classInfo.location.start;
		let end = classInfo.location.end;
		if (sourceUri) {
			return [
				Location.create(sourceUri, { start: { line: start.line, character: start.column }, end: { line: end.line, character: end.column } })
			];
		}
	} else { // it means it's a member of a class
		const exprAst: Ast = parse(expr);
		if (!exprAst || !["MemberExpression", "OptionalMemberExpression"].includes(exprAst.type)) return null;
		let objectExpr: string = getSourceOfAst(exprAst.object, expr);
		const memberName: string = exprAst.property.name;

		let type = await getExpressionType(source, pos, objectExpr, context);
		if (!type) return null;



		let className = type.typeName;
		let location;

		//if the member is inherited, look in the class where it was inherited from

		let classInfo: ClassInfo | null = await context.qxClassDb.getFullClassInfo(className);
		if (!classInfo) return null;

		let memberInfo = classInfo.members?.[memberName] ?? classInfo.statics?.[memberName];
		if (!memberInfo) { //check if it's a property
			let matches = /((get)|(set))(\w+)/.exec(memberName);
			if (matches && matches[4]) {
				let propertyName: string = strings.firstDown(matches[4]);
				let propertyInfo: any = classInfo.properties?.[propertyName];
				location = propertyInfo?.location;
				className = propertyInfo.inheritedFrom ?? className;
				if (!location) return null;
			}
		} else {
			location = memberInfo.location;
			className = memberInfo.inheritedFrom ?? className;
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