class SearchMatch {
  constructor(path, text, lineNum, indentLevel = 0, isLastChild = false) {
    if (typeof path !== 'string' || !path) {
      throw new Error('SearchMatch requires a valid path string');
    }

    if (typeof text !== 'string') {
      throw new Error('SearchMatch requires a valid text string');
    }

    if (typeof lineNum !== 'number' || lineNum < 1) {
      throw new Error('SearchMatch requires a valid line number');
    }

    this.type = 'match';
    this.path = path;
    this.name = text;
    this.text = text;
    this.lineNum = lineNum;
    this.indentLevel = indentLevel;
    this.isLastChild = isLastChild;
  }
}

module.exports = SearchMatch;
