import fs = require('fs/promises');
import glob = require('glob');
import path = require("path")

/** Stores information regarding a Qooxdoo class e.g. the methods, properties, and members.
 *  Format is exactly the same as the JSON files found in compiled/xxx/transpiled  
 * */
export type ClassInfo = any;

export interface PackageInfo {
  children: PackageChildType[]
}

export type PackageChildType = { type: "class" | "package", name: string };

/**
 * This class stores all information about all Qooxdoo classes and packages and their hierarchy
 */
export class QxClassDb {
  /** A tree representing the hierarchy of packages and classes in the project */
  private _namesTree = new RootNode();
  /**List of all fully-qualified classes found in the project */
  public readonly classNames: string[] = [];

  /**
    Builds database from all JSON compilation database files, recursively found in <root>/compiled/* /transpiled
   * @param root The directory to get the qooxdoo files from.
   */
  async initialize(root: string): Promise<void> {
    let allFiles: string[] = await glob.glob('./compiled/*/transpiled/**/*.json', { absolute: true, cwd: path.join(root) });

    for (const filePath of allFiles) {
      await this.readClassJson(filePath);
    }
  }

  /**
   * Checks if class exists in database
   * @param className Fully-qualified name of class
   * @returns 
   */
  public classExists(className: string): boolean {
    return this._namesTree.containsNode(className);
  }

  /**
   * Returns information regarding a class or package
   * @param classOrPackageName Fully qualified name of class or package
   * @returns 
   */
  public async getClassOrPackageInfo(classOrPackageName: string): Promise<{ type: "class" | "package"; info: ClassInfo | PackageInfo; } | null> {
    if (!this._namesTree.containsNode(classOrPackageName)) return null;

    let node = this._namesTree.getNode(classOrPackageName);
    switch (node.type) {
      case NodeType.PACKAGE:
        const packageChildren: PackageChildType[] = [];
        const packageNode = node as PackageNode;
        for (const child of packageNode.children) {
          let childType: "class" | "package" = child.type == NodeType.CLASS ? "class"
            : child.type == NodeType.PACKAGE ? "package"
              : "class";

          packageChildren.push({ name: child.name, type: childType });
        }

        return { type: "package", info: { children: packageChildren } };
      case NodeType.CLASS:
        const classNode = node as ClassNode;
        let jsonData = await fs.readFile(classNode.jsonFilePath);
        const classInfo = JSON.parse(jsonData.toString());

        return { type: "class", info: classInfo };
      case NodeType.ROOT:
        throw new Error("Node must not be root!");
    }

  }

  /**
   * Reads the JSON file of the metadata of a class into the database
   * @param filePath 
   * @returns 
   */
  public async readClassJson(filePath: string) {
    let source = await fs.readFile(filePath, { encoding: 'utf-8' });
    let structure = JSON.parse(source);
    let className = structure.className;
    if (!className) return;
    if (this.classNames.indexOf(className) <= 0)
      this.classNames.push(className);

    let node = this._namesTree.getNode(className);
    if (node.type != NodeType.CLASS)
      throw new Error();

    let classNode = node as ClassNode;
    classNode.jsonFilePath = filePath;
  }

}

/** A tree representing the hierarchy of packages and classes in the project */
enum NodeType { ROOT, CLASS, PACKAGE };

class AbstractNode {
  children?: (PackageNode | ClassNode)[];

  constructor(public name: string, public type: NodeType) {

  }

  containsNode(path: string): boolean {
    return this.containsNode_(path.split("."));
  }

  containsNode_(pathItems: string[]): boolean {
    if (!pathItems.length) return true;
    if (!this.children) return false;
    let child = this.children.find(child => child.name == pathItems[0]);
    if (child) {
      pathItems.splice(0, 1);
      return child.containsNode_(pathItems);
    }
    return false;
  }

  /**
   * Creates node if it doesn't exist and returns it.
   * @param path Path to node, consisting of period-separated names (e.g. qx.ui.form or qx.ui.form.Spinner )
   * @returns node
   */
  getNode(path: string): AbstractNode {
    return this._getNode(path.split("."));
  }


  _getChild(name: string, nodeType?: NodeType): (PackageNode | ClassNode) {
    if (!this.children) this.children = [];
    let child = this.children.find(c => c.name == name);
    if (!child) {
      if (nodeType == NodeType.CLASS) {
        child = new ClassNode(name);
      } else {
        child = new PackageNode(name);
      }
      this.children.push(child);
    }
    return child;
  }

  _getNode(path: string[]): AbstractNode {
    if (!path.length) {
      return this;
    } else {
      let childName = path.at(0);
      if (!childName) throw new Error("Child must not be null");
      let nodeType = path.length == 1 ? NodeType.CLASS : NodeType.PACKAGE;
      path.splice(0, 1);
      return this._getChild(childName, nodeType)._getNode(path);
    }
  }
};

class RootNode extends AbstractNode {
  constructor() {
    super("root", NodeType.ROOT)
  }
}

class ClassNode extends AbstractNode {
  jsonFilePath!: string
  constructor(/**Path of compilation DB JSON file of the class */ name: string,

  ) {
    super(name, NodeType.CLASS);
  }
}

class PackageNode extends AbstractNode {
  children!: (PackageNode | ClassNode)[]
  constructor(name: string) {
    super(name, NodeType.PACKAGE);
  }
}

