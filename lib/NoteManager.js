const fs = require('fs').promises;
const path = require('path');
const {exec} = require('child_process');
const {promisify} = require('util');

const execAsync = promisify(exec);

const Note = require('./dto/Note');
const Folder = require('./dto/Folder');
const SearchMatch = require('./dto/SearchMatch');

class NoteManager {
    constructor(dataDir, timezone = null) {
        this.dataDir = dataDir || path.join(__dirname, '../data');
        this.timezone = timezone;
    }

    validatePath(relativePath) {
        const fullPath = path.resolve(path.join(this.dataDir, relativePath));
        if (!fullPath.startsWith(this.dataDir)) {
            throw new Error('Access denied: path outside notes directory');
        }
        return fullPath;
    }

    addMdExtension(filePath) {
        if (!filePath.endsWith('.md')) {
            return `${filePath}.md`;
        }
        return filePath;
    }

    getFullPath(relativePath) {
        const withExt = this.addMdExtension(relativePath);
        this.validatePath(withExt);
        return path.join(this.dataDir, withExt);
    }

    async ensureDir(filePath) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, {recursive: true});
    }

    async write(relativePath, content) {
        const fullPath = this.getFullPath(relativePath);
        await this.ensureDir(fullPath);
        await fs.writeFile(fullPath, content, 'utf8');
        const fileName = path.basename(relativePath) + '.md';
        return new Note(relativePath, fileName, content);
    }

    async new(relativePath, content) {
        const fullPath = this.getFullPath(relativePath);

        try {
            await fs.access(fullPath);
            throw new Error(`Note already exists: ${relativePath}`);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        await this.ensureDir(fullPath);
        await fs.writeFile(fullPath, content, 'utf8');
        const fileName = path.basename(relativePath) + '.md';
        return new Note(relativePath, fileName, content);
    }

    async append(relativePath, content) {
        const fullPath = this.getFullPath(relativePath);
        await this.ensureDir(fullPath);

        let existingContent = '';
        try {
            existingContent = await fs.readFile(fullPath, 'utf8');
            if (existingContent && !existingContent.endsWith('\n')) {
                existingContent += '\n';
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        const finalContent = existingContent + content;
        await fs.writeFile(fullPath, finalContent, 'utf8');
        const fileName = path.basename(relativePath) + '.md';
        return new Note(relativePath, fileName, finalContent);
    }

    async read(relativePath) {
        const fullPath = this.getFullPath(relativePath);

        try {
            const content = await fs.readFile(fullPath, 'utf8');
            const fileName = path.basename(relativePath) + '.md';
            return new Note(relativePath, fileName, content);
        } catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`Note not found: ${relativePath}`);
            }
            throw err;
        }
    }

    async delete(relativePath) {
        const fullPath = this.getFullPath(relativePath);

        try {
            const stat = await fs.stat(fullPath);
            const fileName = path.basename(relativePath);

            if (stat.isDirectory()) {
                await fs.rm(fullPath, {recursive: true, force: true});
                return new Folder(relativePath, fileName);
            } else {
                await fs.unlink(fullPath);
                return new Note(relativePath, fileName + '.md');
            }
        } catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`Note not found: ${relativePath}`);
            }
            throw err;
        }
    }

    async move(fromPath, toPath) {
        const fromFull = this.getFullPath(fromPath);
        const toFull = this.getFullPath(toPath);

        try {
            await fs.access(fromFull);
        } catch (err) {
            throw new Error(`Source note not found: ${fromPath}`);
        }

        try {
            await fs.access(toFull);
            throw new Error(`Destination already exists: ${toPath}`);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }

        await this.ensureDir(toFull);
        await fs.rename(fromFull, toFull);
        const fileName = path.basename(toPath) + '.md';
        return new Note(toPath, fileName);
    }

    async createFolder(relativePath) {
        const fullPath = path.join(this.dataDir, relativePath);
        this.validatePath(relativePath);

        await fs.mkdir(fullPath, { recursive: true });
        const folderName = path.basename(relativePath);
        return new Folder(relativePath, folderName);
    }

    async list(relativePath = '.', recursive = true) {
        const fullPath = path.join(this.dataDir, relativePath);

        try {
            await fs.access(fullPath);
        } catch (err) {
            throw new Error(`Directory not found: ${relativePath}`);
        }

        if (recursive) {
            return await this.listRecursive(fullPath, this.dataDir);
        } else {
            return await this.listDirectory(fullPath, this.dataDir);
        }
    }

    async listDirectory(dir, baseDir) {
        const items = [];
        const entries = await fs.readdir(dir, {withFileTypes: true});

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (entry.isDirectory()) {
                items.push(new Folder(relativePath, entry.name));
            } else if (entry.name.endsWith('.md')) {
                items.push(new Note(relativePath.replace(/\.md$/, ''), entry.name));
            }
        }

        return items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    async listRecursive(dir, baseDir) {
        const entries = await fs.readdir(dir, {withFileTypes: true});

        // Sort: directories first, then alphabetically
        const sorted = entries.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        const items = [];
        for (const entry of sorted) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (entry.isDirectory()) {
                const children = await this.listRecursive(fullPath, baseDir);
                items.push(new Folder(relativePath, entry.name, children));
            } else if (entry.name.endsWith('.md')) {
                items.push(new Note(relativePath.replace(/\.md$/, ''), entry.name));
            }
        }

        return items;
    }

    async search(term, listOnly = false, withColor = false) {
        try {
            const colorFlag = withColor ? ' --color=always' : '';
            const grepCmd = listOnly
                ? `grep -rli${colorFlag} "${term}" "${this.dataDir}" 2>/dev/null | grep '\\.md$' || true`
                : `grep -rni${colorFlag} "${term}" "${this.dataDir}" 2>/dev/null | grep '\\.md:' || true`;

            const {stdout} = await execAsync(grepCmd);

            if (listOnly) {
                const files = stdout
                    .trim()
                    .split('\n')
                    .filter(line => line)
                    .map(file => file.replace(this.dataDir + '/', '').replace(/\.md$/, ''));
                return {files};
            } else {
                // Parse grep output into structured items
                const lines = stdout
                    .trim()
                    .split('\n')
                    .filter(line => line);

                if (lines.length === 0) {
                    return [];
                }

                // Parse all matches
                const parsed = lines.map(line => {
                    const firstColon = line.indexOf(':');
                    const secondColon = line.indexOf(':', firstColon + 1);
                    if (firstColon === -1 || secondColon === -1) return null;

                    const filePath = line.substring(0, firstColon).replace(this.dataDir + '/', '').replace(/\.md$/, '');
                    const lineNum = parseInt(line.substring(firstColon + 1, secondColon));
                    const text = line.substring(secondColon + 1);

                    return {filePath, lineNum, text};
                }).filter(Boolean);

                // Group by folder and file
                const structure = {};
                parsed.forEach(item => {
                    const parts = item.filePath.split('/');
                    const folderPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

                    if (!structure[folderPath]) {
                        structure[folderPath] = [];
                    }
                    structure[folderPath].push(new SearchMatch(item.filePath, item.text, item.lineNum));
                });

                // Build nested folder structure with search matches as content
                const items = [];
                const sortedFolders = Object.keys(structure).sort();

                sortedFolders.forEach(folder => {
                    if (folder) {
                        // Folder with search matches as content
                        const folderName = folder.split('/').pop();
                        items.push(new Folder(folder, folderName, structure[folder]));
                    } else {
                        // Root level matches - add them directly
                        items.push(...structure[folder]);
                    }
                });

                return items;
            }
        } catch (err) {
            return [];
        }
    }

    async quickJournal(content = null) {
        const now = new Date();

        let dateStr, timeStr;
        if (this.timezone) {
            const tzDate = now.toLocaleString('en-CA', {
                timeZone: this.timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            const [date, time] = tzDate.split(', ');
            dateStr = date;
            timeStr = time;
        } else {
            dateStr = now.toISOString().split('T')[0];
            timeStr = now.toTimeString().slice(0, 5);
        }

        const journalPath = `_journal/${dateStr}`;
        const fullPath = this.getFullPath(journalPath);

        if (content === null) {
            try {
                return await this.read(journalPath);
            } catch (err) {
                const fileName = dateStr + '.md';
                return new Note(journalPath, fileName, null);
            }
        }

        await this.ensureDir(fullPath);

        let existingContent = '';
        try {
            existingContent = await fs.readFile(fullPath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                existingContent = `# ${dateStr}\n\n`;
            } else {
                throw err;
            }
        }

        const entry = `## ${timeStr}\n${content}\n\n`;
        const finalContent = existingContent + entry;
        await fs.writeFile(fullPath, finalContent, 'utf8');

        const fileName = dateStr + '.md';
        return new Note(journalPath, fileName, finalContent);
    }
}

module.exports = NoteManager;
