class Note {
  constructor(path, name, indentLevel = 0, isLastChild = false, content = null) {
    if (typeof path !== 'string' || !path) {
      throw new Error('Note requires a valid path string');
    }

    if (typeof name !== 'string' || !name) {
      throw new Error('Note requires a valid name string');
    }

    this.type = 'file';
    this.path = path;
    this.name = name;
    this.indentLevel = indentLevel;
    this.isLastChild = isLastChild;

    if (content !== null) {
      if (typeof content !== 'string') {
        throw new Error('Note content must be a string or null');
      }
      this.content = content;
    }
  }
}

module.exports = Note;
