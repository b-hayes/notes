class SearchMatch {
    constructor(path, text, lineNum) {
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
    }
}

module.exports = SearchMatch;
