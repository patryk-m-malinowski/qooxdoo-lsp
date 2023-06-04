import fs = require('fs/promises');
import glob = require('glob');
import path = require("path")

export class Node {
	name!: string | null;
	docString?: string;
	type!: NodeType | null;
	children?: Node[];

	constructor(name: string | null, type: NodeType | null) {
		this.name = name;
		this.type = type;
	}

	containsNode(path: string): boolean {
		return this.containsNode_(path.split("."));
	}
	containsNode_(pathItems: string[]): boolean {
		if (!this.children) return false;
		if (!pathItems.length) return true;
		let child = this.children.find(child => child.name == pathItems[0]);
		if (child) {
			pathItems.splice(0, 1);
			return child.containsNode_(pathItems);
		}
		return false;
	}

	getNode(path: string): Node {
		return this._getNode(path.split("."));
	}


	_getChild(name: string): Node {
		if (!this.children) this.children = [];
		let child = this.children.find(c => c.name == name);
		if (!child) {
			let childType = name[0] >= 'A' && name[0] <= 'Z' ? NodeType.CLASS : NodeType.PACKAGE;
			child = new Node(name, childType);
			this.children.push(child);
		}
		return child;
	}

	_getNode(path: string[]): Node {
		if (!path.length) {
			return this;
		} else {
			let childName = path.at(0);
			if (!childName) throw new Error("Child must not be null");
			path.splice(0, 1);
			return this._getChild(childName)._getNode(path);
		}
	}
}

export enum NodeType { PACKAGE, CLASS, METHOD, MEMBER_VARIABLE, STATIC_METHOD, STATIC_VARIABLE };
// enum NodeType {PACKAGE, CLASS};

export class QxDatabase {
	fileNames_: string[] = [];
	root_: Node = new Node(null, null);
	classnames: string[] = [];

	/**
	  Builds database from all qooxdoo source files which are recursively found in *root*
	 * @param root The directory to get the qooxdoo files from. Search is done recursively
	 */
	async initialize(root: string): Promise<void> {

		this.classnames = [];
    this.root_ = new Node(null, null);
		let allFiles: string[] = glob.globSync("**/*.json", { absolute: true, cwd: path.join(root, "compiled/source/transpiled") });
		await Promise.all(
			allFiles.map(file =>
				// this._insertNode(nodePath, _getNodeFromAst(parse(file)));
				this.readFile(file)

			)
		);
	}
	containsNode(nodePath: string): boolean {
		return this.root_.containsNode(nodePath);
	}
	getNode(nodePath: string): Node {
		return this.root_.getNode(nodePath);
	}

	/**
	 * Reads file from specified path into database.
	 * @param path File path
	 */
	async readFile(path: string) {
		let source = await fs.readFile(path, { encoding: 'utf-8' });
		let structure = JSON.parse(source);
		let className = structure.className;
		if (!className) return;
		this.classnames.push(className);
		let node = this.getNode(className);

		if (structure.members) {
			Object.keys(structure.members).forEach(memberName => {
				let type = null;
				let member = structure.members[memberName];
				switch (member.type) {
					case "function":
						type = NodeType.METHOD;
						break;
					case "variable":
						type = NodeType.MEMBER_VARIABLE;
						break;
					default:
						type = NodeType.METHOD;
				}
				let child: Node = new Node(memberName, type);
				if (!node.children) node.children = [];
				node.children.push(child);
			})
		}
	}

	getRoot(): Node {
		return this.root_;
	}
}