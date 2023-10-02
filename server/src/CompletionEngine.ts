import { CompletionItem, CompletionItemKind, CompletionParams, CompletionTriggerKind, TextDocument, integer } from 'vscode-languageserver';
import { ClassInfo, PackageInfo } from './QxClassDb';
import { Server } from './server'
import { Context } from './Context';
import { rfind } from './search';
import { regexes } from './regexes';
import { getObjectExpressionEndingAt } from './sourceTools';


const RGX_IDENTIFIER = "[A-Za-z][A-Za-z_0-9]*";

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
    const classDb = Context.getInstance().qxClassDb;


    let document: TextDocument | undefined = Server.getInstance().documents.get(completionInfo.textDocument.uri);
    if (!document) throw new Error("Text document is undefined!");

    let caretCharacterIndex: integer = document.offsetAt(completionInfo.position);
    let source: string = document.getText();

    let dotPos = rfind(source, caretCharacterIndex, `\\.(${regexes.IDENTIFIER})?`); // TODO make this an identifier!
    if (dotPos && dotPos.end != caretCharacterIndex) dotPos = null;
    let exprn: string | null = dotPos && getObjectExpressionEndingAt(source, dotPos.start);

    if (exprn) {
      if (!dotPos) throw new Error();
      /**
       * Returns completion items for class or package. Returns null if the class or package is not found in project.
       * @param classOrPackageName Fully-qualified name of class or package
       */
      async function getCompletionItemsForClassOrPackage(classOrPackageName: string): Promise<CompletionItem[] | null> {
        const completionItems: CompletionItem[] = [];
        let classOrPackageInfo = await classDb.getClassOrPackageInfo(classOrPackageName);
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

      let typeInfo = await Context.getInstance().getExpressionType(source, dotPos.start, exprn);
      if (typeInfo)
        return await getCompletionItemsForClassOrPackage(typeInfo?.typeName) ?? [];

    }
    return [];
  }
}