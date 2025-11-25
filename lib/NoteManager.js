const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class NoteManager {
  constructor(dataDir, timezone = null) {
    this.dataDir = dataDir || path.join(__dirname, '../data');
    this.timezone = timezone;
  }

  addMdExtension(filePath) {
    if (!filePath.endsWith('.md')) {
      return `${filePath}.md`;
    }
    return filePath;
  }

  getFullPath(relativePath) {
    const withExt = this.addMdExtension(relativePath);
    return path.join(this.dataDir, withExt);
  }

  async ensureDir(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  async write(relativePath, content) {
    const fullPath = this.getFullPath(relativePath);
    await this.ensureDir(fullPath);
    await fs.writeFile(fullPath, content, 'utf8');
    return { success: true, path: relativePath };
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
    return { success: true, path: relativePath };
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

    await fs.writeFile(fullPath, existingContent + content, 'utf8');
    return { success: true, path: relativePath };
  }

  async read(relativePath) {
    const fullPath = this.getFullPath(relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return { success: true, content, path: relativePath };
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
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true, path: relativePath };
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
    return { success: true, from: fromPath, to: toPath };
  }

  async list(relativePath = '.', recursive = true) {
    const fullPath = path.join(this.dataDir, relativePath);

    try {
      await fs.access(fullPath);
    } catch (err) {
      throw new Error(`Directory not found: ${relativePath}`);
    }

    if (recursive) {
      const items = await this.listRecursive(fullPath, this.dataDir);
      return { success: true, items };
    } else {
      const items = await this.listDirectory(fullPath, this.dataDir);
      return { success: true, items };
    }
  }

  async listDirectory(dir, baseDir) {
    const items = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        items.push({ type: 'dir', path: relativePath, name: entry.name });
      } else if (entry.name.endsWith('.md')) {
        items.push({
          type: 'file',
          path: relativePath.replace(/\.md$/, ''),
          name: entry.name
        });
      }
    }

    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async listRecursive(dir, baseDir) {
    const items = [];

    async function scanDir(currentDir, relativePath = '', depth = 0) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      // Sort: directories first, then alphabetically
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i];
        const isLast = i === sorted.length - 1;
        const fullPath = path.join(currentDir, entry.name);
        const itemRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          // Add directory entry
          items.push({
            type: 'dir',
            path: itemRelativePath,
            name: entry.name,
            indentLevel: depth,
            isLastChild: isLast
          });
          // Recursively scan subdirectory
          await scanDir(fullPath, itemRelativePath, depth + 1);
        } else if (entry.name.endsWith('.md')) {
          // Add file entry
          items.push({
            type: 'file',
            path: itemRelativePath.replace(/\.md$/, ''),
            name: entry.name,
            indentLevel: depth,
            isLastChild: isLast
          });
        }
      }
    }

    await scanDir(dir);
    return items;
  }

  async search(term, listOnly = false) {
    try {
      const grepCmd = listOnly
        ? `grep -rl "${term}" "${this.dataDir}" --include="*.md" 2>/dev/null || true`
        : `grep -rn "${term}" "${this.dataDir}" --include="*.md" 2>/dev/null || true`;

      const { stdout } = await execAsync(grepCmd);

      if (listOnly) {
        const files = stdout
          .trim()
          .split('\n')
          .filter(line => line)
          .map(file => file.replace(this.dataDir + '/', '').replace(/\.md$/, ''));
        return { success: true, files };
      } else {
        const matches = stdout
          .trim()
          .split('\n')
          .filter(line => line)
          .map(line => line.replace(this.dataDir + '/', ''));
        return { success: true, matches };
      }
    } catch (err) {
      return { success: true, files: [], matches: [] };
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
        const result = await this.read(journalPath);
        return { success: true, content: result.content, path: journalPath };
      } catch (err) {
        return { success: true, content: null, path: journalPath };
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
    await fs.writeFile(fullPath, existingContent + entry, 'utf8');

    return { success: true, path: journalPath, time: timeStr };
  }
}

module.exports = NoteManager;
