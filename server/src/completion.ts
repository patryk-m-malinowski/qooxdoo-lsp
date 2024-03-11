import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { PackageInfo, QxClassDb } from './QxClassDb';
import { ClassInfo } from './ClassInfo';
import { regexes } from './regexes';
import { rfind } from './rfind';
import { getObjectExpressionEndingAt } from './sourceTools';
import { getExpressionType } from './getExpressionType'
import { QxProjectContext } from './QxProjectContext';
import { strings } from './strings';

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
	if (!typeInfo) {
		return getTokensForEverything(qxClassDb);
	};

	const classOrPackageName = typeInfo.typeName;

	const completionItems: CompletionItem[] = [];

	let classOrPackageInfo = await qxClassDb.getClassOrPackageInfo(classOrPackageName);
	if (!classOrPackageInfo) return null;

	if (classOrPackageInfo.type == "package") {
		const packageInfo: PackageInfo = classOrPackageInfo.info as any;
		for (const packageChild of packageInfo.children) {
			completionItems.push({ label: packageChild.name, kind: packageChild.type == "class" ? CompletionItemKind.Class : CompletionItemKind.Module });
		}
	} else {
		let fullClassInfo: ClassInfo = await qxClassDb.getFullClassInfo(classOrPackageName);//!!
		let allMembers = { ...fullClassInfo.statics, ...fullClassInfo.members };

		for (let memberName in allMembers) {
			let member = allMembers[memberName];
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
	}

	return completionItems;
}

async function getTokensForEverything(classDb: QxClassDb) {
	let completionItems: CompletionItem[] = [];

	let allMembers: Set<string> = new Set();

	let scanMembersOfClassCalls: Promise<void>[] = [];

	async function scanMembersOfClass(classname: string): Promise<void> {
		completionItems.push({ label: classname, kind: CompletionItemKind.Class });

		let classInfo: ClassInfo = (await classDb.getClassOrPackageInfo(classname))?.info as any;
		if (!classInfo) throw new Error("Class info not found!");

		for (let propertyName in classInfo.properties) {
			for (let prefix of ["get", "set"]) {
				allMembers.add(prefix + strings.firstUp(propertyName));
			}

			allMembers.add(propertyName);
			allMembers.add('change' + strings.firstUp(propertyName));
		}

		for (let memberName in { ...classInfo.members, ...classInfo.statics }) {
			allMembers.add(memberName);
		}
	}

	for (let classname of classDb.classNames) {
		scanMembersOfClassCalls.push(scanMembersOfClass(classname));
	}

	await Promise.all(scanMembersOfClassCalls);

	for (let member of allMembers) {
		completionItems.push({ label: member, kind: CompletionItemKind.Text });
	}

	return completionItems;
}