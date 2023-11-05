import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { ClassInfo, PackageInfo, QxClassDb } from './QxClassDb';
import { regexes } from './regexes';
import { rfind } from './rfind';
import { getObjectExpressionEndingAt } from './sourceTools';
import { getExpressionType } from './getExpressionType'
import { QxProjectContext } from './QxProjectContext';

/**
 * Implementation for completion suggestions (IntelliSense)
 * @param source Source code string of where completion was requested
 * @param offset Zero-based index of the cursor in the source where completion was requested
 * @param context Qx project context object
 * @returns 
 */
export async function getCompletionSuggestions(source: string, offset: number, context: QxProjectContext): Promise<CompletionItem[] | null> {
	const qxClassDb: QxClassDb = context.qxClassDb;

	let dotPos = rfind(source, offset, `(\\?)?\\.(${regexes.IDENTIFIER})?`, true);
	const exprn: string | null = dotPos && getObjectExpressionEndingAt(source, dotPos.start);

	if (!exprn)
		return qxClassDb.classNames.map(classname => { return { label: classname, kind: CompletionItemKind.Class }; });

	if (!dotPos) throw new Error("Should not call here! Please fix bug!");

	let typeInfo = await getExpressionType(source, dotPos.start, exprn, context);
	if (!typeInfo) return null;

	const classOrPackageName = typeInfo.typeName;

	const completionItems: CompletionItem[] = [];

	let classOrPackageInfo = await qxClassDb.getClassOrPackageInfo(classOrPackageName);
	if (!classOrPackageInfo) return null;

	if (classOrPackageInfo.type == "package") {
		const packageInfo: PackageInfo = classOrPackageInfo.info;
		for (const packageChild of packageInfo.children) {
			completionItems.push({ label: packageChild.name, kind: packageChild.type == "class" ? CompletionItemKind.Class : CompletionItemKind.Module });
		}
	} else {
		const addCompletionItem = (memberName: string, member: any) => {
			let kind: CompletionItemKind = CompletionItemKind.Text;
			switch (member.type) {
				case "function":
					kind = CompletionItemKind.Method;
					break;
				case "variable":
					kind = CompletionItemKind.Variable;
					break;
				default:
					kind = CompletionItemKind.Text;
			};

			completionItems.push({
				label: memberName,
				kind: kind,
				documentation: member?.jsdoc?.["@description"]?.[0]?.body
			})
		}
		const classInfo: ClassInfo = classOrPackageInfo.info;
		if (classInfo.members) {
			Object.keys(classInfo.members).forEach(memberName => addCompletionItem(memberName, classInfo.members[memberName]));
		}
		if (classInfo.statics) {
			Object.keys(classInfo.statics).forEach(memberName => addCompletionItem(memberName, classInfo.statics[memberName]));
		}
	}

	return completionItems;
} 