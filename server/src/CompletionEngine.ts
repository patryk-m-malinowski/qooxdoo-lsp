import { CompletionItem, CompletionItemKind, CompletionParams, CompletionTriggerKind, TextDocument, integer } from 'vscode-languageserver';
import { ClassInfo, PackageInfo, ClassOrPackageType } from './QxClassDb';
import { Server } from './server'

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


    if (exprn) {
      /**
       * Returns completion items for class or package. Returns null if the class or package is not found in project.
       * @param classOrPackageName Fully-qualified name of class or package
       */
      async function getCompletionItemsForClassOrPackage(classOrPackageName: string): Promise<CompletionItem[] | null> {
        const completionItems: CompletionItem[] = [];
        let classOrPackageInfo = await classDb.getClassOrPackageInfo(classOrPackageName);
        if (!classOrPackageInfo) return null;

        if (classOrPackageInfo.type == ClassOrPackageType.PACKAGE) {
          const packageInfo: PackageInfo = classOrPackageInfo.info;
          for (const packageChild of packageInfo.children) {
            completionItems.push({ label: packageChild.name, kind: packageChild.type == ClassOrPackageType.CLASS ? CompletionItemKind.Class : CompletionItemKind.Module });
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
              kind: kind
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

      //check if the expression is a fully-qualified name of a qx class      
      let classOrPackageCompletionItems = await getCompletionItemsForClassOrPackage(exprn);
      if (classOrPackageCompletionItems) {
        return classOrPackageCompletionItems;
      } else if (exprn == "this") {
        let groups = RGX_CLASSDEF.exec(source);
        let className = groups?.at(1);
        if (className) return (await getCompletionItemsForClassOrPackage(className)) ?? [];

      } else if (new RegExp(RGX_IDENTIFIER).test(exprn)) {

        function getDataTypeOfVariable() {
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

        let dataType = getDataTypeOfVariable();
        (global as any).break = true;
        if (dataType) return (await getCompletionItemsForClassOrPackage(dataType)) ?? [];
        (global as any).break = false;
      }
      return [];

    } else {
      return classDb.classNames.map(classname => { return { label: classname, kind: CompletionItemKind.Class }; });
    }
  }
}