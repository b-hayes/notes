class Directory {
  constructor(path, name, indentLevel = 0, isLastChild = false) {
    if (typeof path !== 'string' || !path) {
      throw new Error('Directory requires a valid path string');
    }

    if (typeof name !== 'string' || !name) {
      throw new Error('Directory requires a valid name string');
    }

    this.type = 'dir';
    this.path = path;
    this.name = name;
    this.indentLevel = indentLevel;
    this.isLastChild = isLastChild;
  }
}

module.exports = Directory;
