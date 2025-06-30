class NotesApp {
    constructor() {
        this.currentFile = null;
        this.unsavedChanges = false;
        this.parser = new MarkdownParser();
        this.autoSaveTimeout = null;
        this.selectedFolder = ''; // Track currently selected folder for new items
        this.draggedItem = null; // Track item being dragged

        this.initializeElements();
        this.bindEvents();
        this.loadFileStructure();
    }

    initializeElements() {
        this.fileExplorer = document.getElementById('file-explorer');
        this.markdownEditor = document.getElementById('markdown-editor');
        this.markdownPreview = document.getElementById('markdown-preview');
        this.currentFilePath = document.getElementById('current-file-path');
        this.deleteBtn = document.getElementById('delete-btn');
        this.newNoteBtn = document.getElementById('new-note-btn');
        this.newFolderBtn = document.getElementById('new-folder-btn');

        // Mobile elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebar-overlay');
        this.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        this.isMobileMenuOpen = false;
    }

    bindEvents() {
        // Editor events
        this.markdownEditor.addEventListener('input', () => {
            this.onEditorChange();
        });

        this.markdownEditor.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveCurrentFile();
            }
        });

        // Toolbar events
        this.deleteBtn.addEventListener('click', () => this.deleteCurrentFile());
        this.newNoteBtn.addEventListener('click', () => this.createNewNote());
        this.newFolderBtn.addEventListener('click', () => this.createNewFolder());

        // Auto-save on window beforeunload
        window.addEventListener('beforeunload', (e) => {
            if (this.unsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Mobile menu toggle
        this.mobileMenuBtn.addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        // Close mobile menu on overlay click
        this.sidebarOverlay.addEventListener('click', () => {
            this.closeMobileMenu();
        });
    }

    async loadFileStructure() {
        try {
            const response = await fetch('/api/structure');
            const structure = await response.json();
            this.renderFileStructure(structure);
            this.setupRootDropTarget();
        } catch (error) {
            console.error('Error loading file structure:', error);
            this.showError('Failed to load files');
        }
    }

    renderFileStructure(items, container = this.fileExplorer, level = 0) {
        if (level === 0) {
            container.innerHTML = '';
        }

        items.forEach(item => {
            const element = document.createElement('div');

            if (item.type === 'folder') {
                element.className = 'folder-item';
                element.dataset.folderPath = item.path;
                element.dataset.itemPath = item.path;
                element.dataset.itemType = 'folder';
                element.draggable = true;
                element.innerHTML = `
                    <span class="folder-toggle">▶</span>
                    <span>📁 ${item.name}</span>
                    <span class="folder-actions">
                        <button class="folder-action-btn" title="New note in folder">📝</button>
                        <button class="folder-action-btn" title="New folder inside">📁</button>
                    </span>
                `;

                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'folder-children collapsed';

                // Folder toggle event
                const folderToggle = element.querySelector('.folder-toggle');
                const folderName = element.querySelector('span:nth-child(2)');

                const toggleHandler = (e) => {
                    e.stopPropagation();
                    this.toggleFolder(element, childrenContainer);
                };

                folderToggle.addEventListener('click', toggleHandler);
                folderName.addEventListener('click', toggleHandler);

                // Right-click to select folder for new items
                element.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.selectFolder(item.path);
                });

                // Action buttons
                const actionBtns = element.querySelectorAll('.folder-action-btn');
                actionBtns[0].addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.createNewNote(item.path);
                });
                actionBtns[1].addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.createNewFolder(item.path);
                });

                // Drag and drop events
                this.addDragAndDropEvents(element);

                container.appendChild(element);
                container.appendChild(childrenContainer);

                if (item.children && item.children.length > 0) {
                    this.renderFileStructure(item.children, childrenContainer, level + 1);
                }
            } else {
                element.className = 'file-item';
                element.dataset.itemPath = item.path;
                element.dataset.itemType = 'file';
                element.draggable = true;
                element.innerHTML = `<span>📝 ${item.name}</span>`;
                element.addEventListener('click', () => this.openFile(item.path));

                // Drag and drop events
                this.addDragAndDropEvents(element);

                container.appendChild(element);
            }
        });
    }

    addDragAndDropEvents(element) {
        // Drag start
        element.addEventListener('dragstart', (e) => {
            this.draggedItem = {
                path: element.dataset.itemPath,
                type: element.dataset.itemType,
                element: element
            };
            element.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        // Drag end
        element.addEventListener('dragend', (e) => {
            element.classList.remove('dragging');
            document.querySelectorAll('.drop-target').forEach(el => {
                el.classList.remove('drop-target');
            });
            this.draggedItem = null;
        });

        // Only folders can be drop targets
        if (element.dataset.itemType === 'folder') {
            element.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                // Don't allow dropping on self or children
                if (this.draggedItem && !this.isChildPath(element.dataset.itemPath, this.draggedItem.path)) {
                    element.classList.add('drop-target');
                }
            });

            element.addEventListener('dragleave', (e) => {
                // Only remove if we're truly leaving the element
                if (!element.contains(e.relatedTarget)) {
                    element.classList.remove('drop-target');
                }
            });

            element.addEventListener('drop', (e) => {
                e.preventDefault();
                element.classList.remove('drop-target');

                if (this.draggedItem && !this.isChildPath(element.dataset.itemPath, this.draggedItem.path)) {
                    this.moveItem(this.draggedItem.path, element.dataset.itemPath);
                }
            });
        }

        // Also allow dropping on the root file explorer
        if (element === this.fileExplorer) {
            element.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            element.addEventListener('drop', (e) => {
                e.preventDefault();
                if (this.draggedItem) {
                    this.moveItem(this.draggedItem.path, '');
                }
            });
        }
    }

    toggleFolder(folderElement, childrenContainer) {
        const isExpanded = folderElement.classList.contains('expanded');

        if (isExpanded) {
            folderElement.classList.remove('expanded');
            childrenContainer.classList.add('collapsed');
        } else {
            folderElement.classList.add('expanded');
            childrenContainer.classList.remove('collapsed');
        }
    }

    // Add drag and drop to root file explorer
    setupRootDropTarget() {
        this.fileExplorer.addEventListener('dragover', (e) => {
            // Only if dragging over empty space (not over a specific item)
            if (e.target === this.fileExplorer) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this.fileExplorer.classList.add('drop-target-root');
            }
        });

        this.fileExplorer.addEventListener('dragleave', (e) => {
            if (!this.fileExplorer.contains(e.relatedTarget)) {
                this.fileExplorer.classList.remove('drop-target-root');
            }
        });

        this.fileExplorer.addEventListener('drop', (e) => {
            if (e.target === this.fileExplorer && this.draggedItem) {
                e.preventDefault();
                this.fileExplorer.classList.remove('drop-target-root');
                this.moveItem(this.draggedItem.path, '');
            }
        });
    }

    isChildPath(parentPath, childPath) {
        // Check if childPath is a child of parentPath or if they're the same
        return childPath === parentPath || childPath.startsWith(parentPath + '/');
    }

    async moveItem(sourcePath, destinationFolder) {
        try {
            const fileName = sourcePath.split('/').pop();
            const destinationPath = destinationFolder ? `${destinationFolder}/${fileName}` : fileName;

            // Don't move if it's the same location
            if (sourcePath === destinationPath) {
                return;
            }

            const response = await fetch(`/api/move/${sourcePath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    destinationPath: destinationPath
                })
            });

            if (!response.ok) {
                throw new Error('Failed to move item');
            }

            // Update current file path if the moved item is currently open
            if (this.currentFile === sourcePath) {
                this.currentFile = destinationPath;
                this.currentFilePath.textContent = destinationPath;
            }

            await this.loadFileStructure();
            this.showSuccess(`Moved to ${destinationFolder || 'root folder'}`);

        } catch (error) {
            console.error('Error moving item:', error);
            this.showError('Failed to move item');
        }
    }

    async openFile(filePath) {
        // Save current file if there are unsaved changes
        if (this.unsavedChanges) {
            await this.saveCurrentFile();
        }

        try {
            const response = await fetch(`/api/notes/${filePath}`);
            if (!response.ok) {
                throw new Error('Failed to load file');
            }

            const data = await response.json();
            this.currentFile = filePath;
            this.markdownEditor.value = data.content;
            this.markdownEditor.disabled = false;
            this.currentFilePath.textContent = filePath;
            this.deleteBtn.disabled = false;
            this.unsavedChanges = false;

            // Update preview
            this.updatePreview();

            // Update active file in sidebar
            this.updateActiveFile(filePath);

        } catch (error) {
            console.error('Error opening file:', error);
            this.showError('Failed to open file');
        }
    }

    updateActiveFile(filePath) {
        // Remove active class from all files
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to current file
        document.querySelectorAll('.file-item').forEach(item => {
            const fileName = item.textContent.trim().substring(2); // Remove emoji
            if (filePath.endsWith(fileName)) {
                item.classList.add('active');
            }
        });
    }

    onEditorChange() {
        this.unsavedChanges = true;
        this.updatePreview();
        this.scheduleAutoSave();
    }

    updatePreview() {
        const markdown = this.markdownEditor.value;
        const html = this.parser.parse(markdown);
        this.markdownPreview.innerHTML = html || '<div class="welcome-message"><p>Start typing to see the preview...</p></div>';
    }

    scheduleAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            if (this.unsavedChanges && this.currentFile) {
                this.saveCurrentFile();
            }
        }, 2000); // Auto-save after 2 seconds of inactivity
    }

    async saveCurrentFile() {
        if (!this.currentFile) return;

        try {
            const response = await fetch(`/api/notes/${this.currentFile}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: this.markdownEditor.value
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save file');
            }

            this.unsavedChanges = false;
            // Removed success notification since it's auto-save

        } catch (error) {
            console.error('Error saving file:', error);
            this.showError('Failed to save file');
        }
    }

    async deleteCurrentFile() {
        if (!this.currentFile) return;

        if (!confirm(`Are you sure you want to delete "${this.currentFile}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/notes/${this.currentFile}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete file');
            }

            // Clear editor
            this.markdownEditor.value = '';
            this.markdownEditor.disabled = true;
            this.currentFilePath.textContent = 'Select or create a note to start writing';
            this.deleteBtn.disabled = true;
            this.currentFile = null;
            this.unsavedChanges = false;

            // Refresh file structure
            await this.loadFileStructure();

            // Reset preview
            this.markdownPreview.innerHTML = `
                <div class="welcome-message">
                    <h1>Welcome to Markdown Notes</h1>
                    <p>Select a note from the sidebar or create a new one to start writing.</p>
                </div>
            `;

            this.showSuccess('File deleted');

        } catch (error) {
            console.error('Error deleting file:', error);
            this.showError('Failed to delete file');
        }
    }

    selectFolder(folderPath) {
        this.selectedFolder = folderPath;

        // Visual feedback for selected folder
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('selected-folder');
        });

        const selectedElement = document.querySelector(`[data-folder-path="${folderPath}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected-folder');
        }

        this.showNotification(`Selected folder: ${folderPath || 'root'}`, 'info');
    }

    async createNewNote(parentFolder = null) {
        const folderPath = parentFolder || this.selectedFolder;
        const folderDisplay = folderPath ? `in "${folderPath}"` : 'in root folder';

        const fileName = prompt(`Enter note name ${folderDisplay} (without .md extension):`);
        if (!fileName) return;

        const filePath = folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;

        try {
            const response = await fetch(`/api/notes/${filePath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: `# ${fileName}\n\nStart writing your note here...`
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create note');
            }

            await this.loadFileStructure();
            await this.openFile(filePath);
            this.showSuccess('Note created');

        } catch (error) {
            console.error('Error creating note:', error);
            this.showError('Failed to create note');
        }
    }

    async createNewFolder(parentFolder = null) {
        const folderPath = parentFolder || this.selectedFolder;
        const folderDisplay = folderPath ? `inside "${folderPath}"` : 'in root folder';

        const folderName = prompt(`Enter folder name ${folderDisplay}:`);
        if (!folderName) return;

        const newFolderPath = folderPath ? `${folderPath}/${folderName}` : folderName;

        try {
            const response = await fetch(`/api/folders/${newFolderPath}`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to create folder');
            }

            await this.loadFileStructure();
            this.showSuccess('Folder created');

        } catch (error) {
            console.error('Error creating folder:', error);
            this.showError('Failed to create folder');
        }
    }

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;

        if (this.isMobileMenuOpen) {
            this.sidebar.classList.add('mobile-open');
            this.sidebarOverlay.classList.add('active');
            this.mobileMenuBtn.classList.add('active');
        } else {
            this.sidebar.classList.remove('mobile-open');
            this.sidebarOverlay.classList.remove('active');
            this.mobileMenuBtn.classList.remove('active');
        }
    }

    closeMobileMenu() {
        this.isMobileMenuOpen = false;
        this.sidebar.classList.remove('mobile-open');
        this.sidebarOverlay.classList.remove('active');
        this.mobileMenuBtn.classList.remove('active');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            border-radius: 4px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: opacity 0.3s;
        `;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NotesApp();
});
