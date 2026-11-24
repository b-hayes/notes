# Markdown Notes

A simple, web-based markdown notes application with live preview and file organization.

## Features

- **Live Markdown Rendering**: See your formatted text as you typed
- **File-based Storage**: Notes are saved as individual files
- **Folder Organization**: Create folders to organize your notes
- **Auto-save**: Changes are automatically saved
- **Mobile Responsive**: Works on desktop and mobile devices
- **Split View**: Side-by-side editor and preview panes

## Getting Started

1. Clone or download this repository
2. run `nom install` and `docker compose up` to start the application
3. Open your browser and navigate to `http://localhost:3000`

## Backups

- `bin/backup.sh` - stops the container briefly and copies `data/` (and `.env` if present) to `/array/backup/notes-<datetime>`, keeps 7.
- `bin/restore.sh <backup-dir>` - isolated restore test (default, live instance untouched); `--into-live` for disaster recovery.
- Cron: `sed "s/__USER__/$USER/" deploy/notes-backup | sudo tee /etc/cron.d/notes-backup`

## Usage

- **New Note**: Click the 📝 button in the sidebar to create a new note
- **New Folder**: Click the 📁 button to create a new folder
- **Edit Notes**: Select a note from the file explorer and start typing in the editor
- **Delete**: Use the delete button in the editor toolbar to remove notes or folders
- **Mobile Menu**: On mobile devices, use the hamburger menu to toggle the sidebar

## Supported Markdown

The app supports standard markdown syntax including:

- Headers (`# ## ###`)
- **Bold** and *italic* text
- ~~Strikethrough~~
- Lists (bulleted and numbered)
- `Inline code` and code blocks
- Links and images

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Custom markdown parser

## Browser Compatibility

Works in all modern browsers that support ES6+ features.