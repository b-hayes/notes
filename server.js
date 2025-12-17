const express = require('express');
const cors = require('cors');
const path = require('path');
const NoteManager = require('./lib/NoteManager');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TIMEZONE = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
const noteManager = new NoteManager(DATA_DIR, TIMEZONE);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes

// Get folder structure
app.get('/api/structure', async (req, res) => {
    try {
        const structure = await noteManager.list('.', true);
        res.json(structure);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Get note content
app.get('/api/notes/*', async (req, res) => {
    try {
        const notePath = req.params[0];
        const note = await noteManager.read(notePath);
        res.json({ content: note.content, path: notePath });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Save note
app.post('/api/notes/*', async (req, res) => {
    try {
        const notePath = req.params[0];
        const { content } = req.body;
        await noteManager.write(notePath, content);
        res.json({ success: true, path: notePath });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Create folder
app.post('/api/folders/*', async (req, res) => {
    try {
        const folderPath = req.params[0];
        await noteManager.createFolder(folderPath);
        res.json({ success: true, path: folderPath });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Delete note or folder
app.delete('/api/notes/*', async (req, res) => {
    try {
        const itemPath = req.params[0];
        await noteManager.delete(itemPath);
        res.json({ success: true, path: itemPath });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Move note or folder
app.post('/api/move/*', async (req, res) => {
    try {
        const sourcePath = req.params[0];
        const { destinationPath } = req.body;
        await noteManager.move(sourcePath, destinationPath);
        res.json({ success: true, from: sourcePath, to: destinationPath });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// Quick journal entry
app.post('/api/quick-note', async (req, res) => {
    try {
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content required' });
        }

        const result = await noteManager.quickJournal(content.trim());
        const pathWithExtension = result.path.endsWith('.md') ? result.path : `${result.path}.md`;
        res.json({
            success: true,
            path: pathWithExtension
        });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

app.listen(PORT, () => {
    console.log(`Notes app running on port ${PORT}`);
});

