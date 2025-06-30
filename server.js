const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// API Routes

// Get folder structure
app.get('/api/structure', async (req, res) => {
  try {
    const structure = await getFolderStructure(DATA_DIR);
    res.json(structure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get note content
app.get('/api/notes/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const fullPath = path.join(DATA_DIR, notePath);

    // Security check - ensure path is within data directory
    if (!fullPath.startsWith(DATA_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!await fs.pathExists(fullPath)) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const content = await fs.readFile(fullPath, 'utf8');
    res.json({ content, path: notePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save note
app.post('/api/notes/*', async (req, res) => {
  try {
    const notePath = req.params[0];
    const { content } = req.body;
    const fullPath = path.join(DATA_DIR, notePath);

    // Security check
    if (!fullPath.startsWith(DATA_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));

    await fs.writeFile(fullPath, content, 'utf8');
    res.json({ success: true, path: notePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create folder
app.post('/api/folders/*', async (req, res) => {
  try {
    const folderPath = req.params[0];
    const fullPath = path.join(DATA_DIR, folderPath);

    if (!fullPath.startsWith(DATA_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await fs.ensureDir(fullPath);
    res.json({ success: true, path: folderPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete note or folder
app.delete('/api/notes/*', async (req, res) => {
  try {
    const itemPath = req.params[0];
    const fullPath = path.join(DATA_DIR, itemPath);

    if (!fullPath.startsWith(DATA_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!await fs.pathExists(fullPath)) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await fs.remove(fullPath);
    res.json({ success: true, path: itemPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Move note or folder
app.post('/api/move/*', async (req, res) => {
  try {
    const sourcePath = req.params[0];
    const { destinationPath } = req.body;

    const sourceFullPath = path.join(DATA_DIR, sourcePath);
    const destFullPath = path.join(DATA_DIR, destinationPath);

    // Security checks
    if (!sourceFullPath.startsWith(DATA_DIR) || !destFullPath.startsWith(DATA_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!await fs.pathExists(sourceFullPath)) {
      return res.status(404).json({ error: 'Source item not found' });
    }

    // Ensure destination directory exists
    await fs.ensureDir(path.dirname(destFullPath));

    // Move the file/folder
    await fs.move(sourceFullPath, destFullPath);

    res.json({ success: true, from: sourcePath, to: destinationPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get folder structure
async function getFolderStructure(dir, relativePath = '') {
  const items = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const itemPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      const children = await getFolderStructure(path.join(dir, entry.name), itemPath);
      items.push({
        name: entry.name,
        type: 'folder',
        path: itemPath,
        children
      });
    } else if (entry.name.endsWith('.md')) {
      items.push({
        name: entry.name,
        type: 'file',
        path: itemPath
      });
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

app.listen(PORT, () => {
  console.log(`Notes app running on port ${PORT}`);
});
