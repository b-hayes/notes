class Folder {
    constructor(path, name, content = null) {
        if (typeof path !== 'string' || !path) {
            throw new Error('Folder requires a valid path string');
        }

        if (typeof name !== 'string' || !name) {
            throw new Error('Folder requires a valid name string');
        }

        this.type = 'folder';
        this.path = path;
        this.name = name;

        // content is null when children not fetched, empty array for empty folder, or array of items
        if (content !== null) {
            if (!Array.isArray(content)) {
                throw new Error('Folder content must be an array or null');
            }
            this.content = content;
        }
    }
}

module.exports = Folder;

