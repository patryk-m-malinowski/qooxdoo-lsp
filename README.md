# qooxdoo-lsp
Language Server Protocol implementation for Qooxdoo framework for Visual Studio Code.
Project still in Beta, so please don't expect for everything to work properly. Use at own risk.

What works:
- Package/class name completion
- Method and member variable name completion (static and non-static)
- Member suggestions for local variables only, which have been initialized using the new keyword only, and not to return values of functions
- Method parameter suggestions
- JSDoc type parsing
- Go to definition (partially)

What doesn't work:
- Type error checking (e.g. calling a method which does not exist for its object)
- There are issues for member suggestions for variables which are declared multiple times within the same file
- Finding references

# Usage
- Please find the VSIX file for the 'continuous' release in the Releases section and install it as a VSCode extension.
- Your Qooxdoo project is allowed to have multiple workspaces, but at least one of the workspaces must contain the "compiled/source/transpiled" directory.
- For best results, make sure the compiler is constantly compiling and that autosave is turned on.

Contributions welcome.