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
        this.loadLastSelectedNote(); // Load last selected note or welcome content
    }

    initializeElements() {
        this.fileExplorer = document.getElementById('file-explorer');
        this.markdownEditor = document.getElementById('markdown-editor');
        this.markdownPreview = document.getElementById('markdown-preview');
        this.previewPane = document.querySelector('.preview-pane');
        this.currentFilePath = document.getElementById('current-file-path');
        this.deleteBtn = document.getElementById('delete-btn');
        this.renameBtn = document.getElementById('rename-btn');
        this.newNoteBtn = document.getElementById('new-note-btn');
        this.newFolderBtn = document.getElementById('new-folder-btn');
        this.helpBtn = document.getElementById('help-btn');

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
            // Tab - Insert spaces to next tab stop (every 4 columns)
            // Shift+Tab - Remove spaces to previous tab stop
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.markdownEditor.selectionStart;
                const end = this.markdownEditor.selectionEnd;
                const value = this.markdownEditor.value;

                if (e.shiftKey) {
                    // Shift+Tab - Remove up to 4 spaces from start of line
                    const lastNewline = value.lastIndexOf('\n', start - 1);
                    const lineStart = lastNewline + 1;
                    const lineEnd = value.indexOf('\n', start);
                    const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
                    const currentLine = value.substring(lineStart, actualLineEnd);

                    // Count leading spaces (remove up to 4)
                    let spacesToRemove = 0;
                    for (let i = 0; i < Math.min(4, currentLine.length); i++) {
                        if (currentLine[i] === ' ') {
                            spacesToRemove++;
                        } else {
                            break;
                        }
                    }

                    if (spacesToRemove > 0) {
                        this.markdownEditor.value = value.substring(0, lineStart) + value.substring(lineStart + spacesToRemove);
                        // Adjust cursor position
                        const newStart = Math.max(lineStart, start - spacesToRemove);
                        const newEnd = Math.max(lineStart, end - spacesToRemove);
                        this.markdownEditor.selectionStart = newStart;
                        this.markdownEditor.selectionEnd = newEnd;
                        this.onEditorChange();
                    }
                } else {
                    // Tab - Insert spaces to next tab stop
                    const lastNewline = value.lastIndexOf('\n', start - 1);
                    const currentColumn = start - (lastNewline + 1);

                    // Calculate spaces needed to reach next tab stop (4, 8, 12, etc.)
                    const spacesToInsert = 4 - (currentColumn % 4);
                    const spaces = ' '.repeat(spacesToInsert);

                    this.markdownEditor.value = value.substring(0, start) + spaces + value.substring(end);
                    this.markdownEditor.selectionStart = this.markdownEditor.selectionEnd = start + spacesToInsert;
                    this.onEditorChange();
                }
            }

            // Enter - Copy indentation from current line
            if (e.key === 'Enter') {
                e.preventDefault();
                const start = this.markdownEditor.selectionStart;
                const end = this.markdownEditor.selectionEnd;
                const value = this.markdownEditor.value;

                // Find start of current line
                const lastNewline = value.lastIndexOf('\n', start - 1);
                const lineStart = lastNewline + 1;
                const currentLine = value.substring(lineStart, value.indexOf('\n', start) === -1 ? value.length : value.indexOf('\n', start));

                // Count leading spaces
                const leadingSpaces = currentLine.match(/^ */)[0].length;
                const indent = ' '.repeat(leadingSpaces);

                this.markdownEditor.value = value.substring(0, start) + '\n' + indent + value.substring(end);
                this.markdownEditor.selectionStart = this.markdownEditor.selectionEnd = start + 1 + leadingSpaces;
                this.onEditorChange();
            }

            // Ctrl+S - Save with notification
            if (e.ctrlKey && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
                e.preventDefault();
                this.saveCurrentFileWithNotification();
            }

            // Ctrl+D - Duplicate current line
            if (e.ctrlKey && (e.key.toLowerCase() === 'd' || e.code === 'KeyD')) {
                e.preventDefault();
                this.duplicateLine();
            }

            // Alt+Shift+Up - Move line up
            if (e.altKey && e.shiftKey && e.key === 'ArrowUp') {
                e.preventDefault();
                this.moveLineUp();
            }

            // Alt+Shift+Down - Move line down
            if (e.altKey && e.shiftKey && e.key === 'ArrowDown') {
                e.preventDefault();
                this.moveLineDown();
            }

            // Ctrl+B - Bold
            if (e.ctrlKey && (e.key.toLowerCase() === 'b' || e.code === 'KeyB')) {
                e.preventDefault();
                this.toggleBold();
            }

            // Ctrl+I - Italic
            if (e.ctrlKey && (e.key.toLowerCase() === 'i' || e.code === 'KeyI')) {
                e.preventDefault();
                this.toggleItalic();
            }
        });

        // Toolbar events
        this.deleteBtn.addEventListener('click', () => this.deleteCurrentFile());
        this.newNoteBtn.addEventListener('click', () => this.createNewNote());
        this.newFolderBtn.addEventListener('click', () => this.createNewFolder());
        this.helpBtn.addEventListener('click', () => this.showHelp());

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

        // Rename button event
        this.renameBtn.addEventListener('click', () => this.renameCurrentFile());

        // Text selection for link toolbar
        this.markdownEditor.addEventListener('mouseup', () => this.handleTextSelection());
        this.markdownEditor.addEventListener('keyup', () => this.handleTextSelection());

        // Hide toolbar when clicking outside
        document.addEventListener('click', (e) => {
            if (this.linkToolbar && !this.linkToolbar.contains(e.target) && e.target !== this.markdownEditor) {
                this.hideLinkToolbar();
            }
        });

        // Scroll synchronization
        this.markdownEditor.addEventListener('scroll', () => this.syncScroll());

        // Intercept link clicks in preview for relative paths
        this.markdownPreview.addEventListener('click', (e) => this.handlePreviewLinkClick(e));
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
            this.renameBtn.disabled = false;
            this.unsavedChanges = false;

            // Save to localStorage for persistence
            localStorage.setItem('lastSelectedNote', filePath);

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

            // Refresh file structure
            await this.loadFileStructure();

            // Reset to welcome content
            this.resetToWelcome();

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

    async renameCurrentFile() {
        if (!this.currentFile) return;

        const currentFileName = this.currentFile.split('/').pop().replace('.md', '');
        const newFileName = prompt('Enter new file name (without .md extension):', currentFileName);
        if (!newFileName) return;

        // Keep the file in the same directory
        const pathParts = this.currentFile.split('/');
        pathParts[pathParts.length - 1] = `${newFileName}.md`;
        const newFilePath = pathParts.join('/');

        try {
            const response = await fetch(`/api/move/${this.currentFile}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    destinationPath: newFilePath
                })
            });

            if (!response.ok) {
                throw new Error('Failed to rename file');
            }

            this.showSuccess('File renamed');

            // Update current file and refresh file structure
            this.currentFile = newFilePath;
            this.currentFilePath.textContent = newFilePath;
            await this.loadFileStructure();

        } catch (error) {
            console.error('Error renaming file:', error);
            this.showError('Failed to rename file');
        }
    }

    async saveCurrentFileWithNotification() {
        if (!this.currentFile) return;

        try {
            await this.saveCurrentFile();
            this.showSuccess('File saved');
        } catch (error) {
            this.showError('Failed to save file');
        }
    }

    duplicateLine() {
        const textarea = this.markdownEditor;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        // Find the start and end of the current line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = value.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;

        // Get the current line content
        const currentLine = value.substring(lineStart, actualLineEnd);

        // Insert the duplicated line
        const newValue = value.substring(0, actualLineEnd) + '\n' + currentLine + value.substring(actualLineEnd);
        textarea.value = newValue;

        // Position cursor at the beginning of the duplicated line
        const newCursorPos = actualLineEnd + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;

        this.onEditorChange();
    }

    moveLineUp() {
        this.moveLine(-1);
    }

    moveLineDown() {
        this.moveLine(1);
    }

    moveLine(direction) {
        const textarea = this.markdownEditor;
        const start = textarea.selectionStart;
        const value = textarea.value;

        // Find current line boundaries
        const currentLineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLineEnd = value.indexOf('\n', start);
        const actualCurrentLineEnd = currentLineEnd === -1 ? value.length : currentLineEnd;

        const currentLine = value.substring(currentLineStart, actualCurrentLineEnd);

        if (direction === -1) {
            // Moving up
            if (currentLineStart === 0) return; // Already at top

            const prevLineStart = value.lastIndexOf('\n', currentLineStart - 2) + 1;
            const prevLine = value.substring(prevLineStart, currentLineStart - 1);

            // Build new content
            const before = value.substring(0, prevLineStart);
            const after = value.substring(actualCurrentLineEnd);

            textarea.value = before + currentLine + '\n' + prevLine + after;

            // Update cursor position
            textarea.selectionStart = textarea.selectionEnd = prevLineStart + (start - currentLineStart);

        } else {
            // Moving down
            if (actualCurrentLineEnd === value.length) return; // Already at bottom

            const nextLineEnd = value.indexOf('\n', actualCurrentLineEnd + 1);
            const actualNextLineEnd = nextLineEnd === -1 ? value.length : nextLineEnd;
            const nextLine = value.substring(actualCurrentLineEnd + 1, actualNextLineEnd);

            // Build new content
            const before = value.substring(0, currentLineStart);
            const after = value.substring(actualNextLineEnd);

            textarea.value = before + nextLine + '\n' + currentLine + after;

            // Update cursor position
            textarea.selectionStart = textarea.selectionEnd = currentLineStart + nextLine.length + 1 + (start - currentLineStart);
        }

        this.onEditorChange();
    }

    toggleBold() {
        this.wrapSelectionWithMarkdown('**');
    }

    toggleItalic() {
        this.wrapSelectionWithMarkdown('*');
    }

    wrapSelectionWithMarkdown(wrapper) {
        const textarea = this.markdownEditor;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const selectedText = value.substring(start, end);

        if (selectedText) {
            // Check if text is already wrapped
            const beforeSelection = value.substring(start - wrapper.length, start);
            const afterSelection = value.substring(end, end + wrapper.length);

            if (beforeSelection === wrapper && afterSelection === wrapper) {
                // Remove existing wrapper
                textarea.value = value.substring(0, start - wrapper.length) + selectedText + value.substring(end + wrapper.length);
                textarea.selectionStart = start - wrapper.length;
                textarea.selectionEnd = end - wrapper.length;
            } else {
                // Add wrapper
                const wrappedText = wrapper + selectedText + wrapper;
                textarea.value = value.substring(0, start) + wrappedText + value.substring(end);
                textarea.selectionStart = start + wrapper.length;
                textarea.selectionEnd = end + wrapper.length;
            }
        } else {
            // No selection, insert wrapper and position cursor inside
            const wrappedText = wrapper + wrapper;
            textarea.value = value.substring(0, start) + wrappedText + value.substring(start);
            textarea.selectionStart = textarea.selectionEnd = start + wrapper.length;
        }

        textarea.focus();
        this.onEditorChange();
    }

    handleTextSelection() {
        const selectedText = this.markdownEditor.value.substring(
            this.markdownEditor.selectionStart,
            this.markdownEditor.selectionEnd
        );

        if (selectedText.length > 0) {
            this.showLinkToolbar();
        } else {
            this.hideLinkToolbar();
        }
    }

    showLinkToolbar() {
        if (!this.linkToolbar) {
            this.linkToolbar = document.createElement('div');
            this.linkToolbar.className = 'link-toolbar';
            this.linkToolbar.innerHTML = '<button class="link-toolbar-btn" title="Insert Link">🔗 Link</button>';
            document.body.appendChild(this.linkToolbar);

            const linkBtn = this.linkToolbar.querySelector('.link-toolbar-btn');
            linkBtn.addEventListener('click', () => this.insertLink());
        }

        const textarea = this.markdownEditor;
        const rect = textarea.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        this.linkToolbar.style.display = 'block';
        this.linkToolbar.style.position = 'absolute';
        this.linkToolbar.style.top = (rect.top + scrollTop - 40) + 'px';
        this.linkToolbar.style.left = (rect.left + (rect.width / 2) - 50) + 'px';
    }

    hideLinkToolbar() {
        if (this.linkToolbar) {
            this.linkToolbar.style.display = 'none';
        }
    }

    insertLink() {
        const start = this.markdownEditor.selectionStart;
        const end = this.markdownEditor.selectionEnd;
        const value = this.markdownEditor.value;
        const selectedText = value.substring(start, end);

        if (!selectedText) {
            this.hideLinkToolbar();
            return;
        }

        const url = prompt('Enter URL:', 'https://');
        if (!url) {
            this.hideLinkToolbar();
            return;
        }

        const markdownLink = `[${selectedText}](${url})`;
        this.markdownEditor.value = value.substring(0, start) + markdownLink + value.substring(end);

        this.markdownEditor.selectionStart = start;
        this.markdownEditor.selectionEnd = start + markdownLink.length;

        this.markdownEditor.focus();
        this.onEditorChange();
        this.hideLinkToolbar();
    }

    syncScroll() {
        const editorScrollTop = this.markdownEditor.scrollTop;
        const editorScrollHeight = this.markdownEditor.scrollHeight - this.markdownEditor.clientHeight;

        if (editorScrollHeight > 0) {
            const scrollPercentage = editorScrollTop / editorScrollHeight;
            const previewScrollHeight = this.previewPane.scrollHeight - this.previewPane.clientHeight;
            this.previewPane.scrollTop = scrollPercentage * previewScrollHeight;
        }
    }

    async handlePreviewLinkClick(e) {
        const target = e.target.closest('a');
        if (!target) return;

        const href = target.getAttribute('href');
        if (!href) return;

        if (this.isRelativePath(href)) {
            e.preventDefault();

            const notePath = this.resolveRelativePath(href);

            try {
                const response = await fetch(`/api/notes/${notePath}`);
                if (response.ok) {
                    await this.openFile(notePath);
                } else {
                    this.showError(`Note not found: ${notePath}`);
                }
            } catch (error) {
                console.error('Error opening linked note:', error);
                this.showError(`Failed to open note: ${notePath}`);
            }
        }
    }

    isRelativePath(href) {
        return !href.match(/^(https?:\/\/|mailto:|tel:|#)/i);
    }

    resolveRelativePath(href) {
        let notePath = href;

        if (notePath.startsWith('./')) {
            notePath = notePath.substring(2);
        }

        if (notePath.startsWith('/')) {
            notePath = notePath.substring(1);
        }

        if (this.currentFile && notePath.startsWith('../')) {
            const currentDir = this.currentFile.substring(0, this.currentFile.lastIndexOf('/'));
            const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/'));
            notePath = parentDir ? `${parentDir}/${notePath.substring(3)}` : notePath.substring(3);
        } else if (this.currentFile && !notePath.includes('/')) {
            const currentDir = this.currentFile.substring(0, this.currentFile.lastIndexOf('/'));
            notePath = currentDir ? `${currentDir}/${notePath}` : notePath;
        }

        if (!notePath.endsWith('.md')) {
            notePath += '.md';
        }

        return notePath;
    }

    async loadWelcomeContent() {
        try {
            const response = await fetch('/Welcome.md');
            if (response.ok) {
                const welcomeContent = await response.text();
                this.markdownEditor.value = welcomeContent;
                this.markdownPreview.innerHTML = this.parser.parse(welcomeContent);
            } else {
                // Fallback to default welcome message if Welcome.md not found
                const fallbackContent = `# Welcome to Markdown Notes

This is your first note! You can edit this content and see the changes reflected in real-time in the preview pane.

## Features

- **Live Preview**: See your markdown rendered as you type
- **File Management**: Create, edit, and delete notes
- **Folder Organisation**: Organise your notes in folders
- **Auto-save**: Your changes are automatically saved
- **Keyboard Shortcuts**: Speed up your editing with handy shortcuts

## Keyboard Shortcuts

The editor supports several helpful keyboard shortcuts to improve your writing experience:

- **Ctrl+S**: Save the current file (shows confirmation message)
- **Ctrl+D**: Duplicate the current line
- **Alt+Shift+↑**: Move the current line up
- **Alt+Shift+↓**: Move the current line down
- **Ctrl+B**: Toggle bold formatting for selected text
- **Ctrl+I**: Toggle italic formatting for selected text

*Note: Auto-save is always active, but Ctrl+S provides reassurance for those who habitually save their work.*

Select a note from the sidebar or create a new one to start writing.`;

                this.markdownEditor.value = fallbackContent;
                this.markdownPreview.innerHTML = this.parser.parse(fallbackContent);
            }
        } catch (error) {
            console.error('Error loading welcome content:', error);
            // Fallback to default welcome message
            const fallbackContent = `# Welcome to Markdown Notes

Select a note from the sidebar or create a new one to start writing.

## Keyboard Shortcuts

- **Ctrl+S**: Save file
- **Ctrl+D**: Duplicate line
- **Alt+Shift+↑/↓**: Move line up/down
- **Ctrl+B/I**: Bold/Italic`;

            this.markdownEditor.value = fallbackContent;
            this.markdownPreview.innerHTML = this.parser.parse(fallbackContent);
        }

        // Set initial state
        this.markdownEditor.disabled = true;
        this.currentFilePath.textContent = 'Welcome - Select or create a note to start editing';
        this.deleteBtn.disabled = true;
        this.renameBtn.disabled = true;
        this.currentFile = null;
        this.unsavedChanges = false;
    }

    resetToWelcome() {
        this.loadWelcomeContent();
    }

    showHelp() {
        // Clear localStorage to show welcome content and reset state
        localStorage.removeItem('lastSelectedNote');
        this.resetToWelcome();
    }

    async loadLastSelectedNote() {
        const lastSelectedNote = localStorage.getItem('lastSelectedNote');

        if (lastSelectedNote) {
            try {
                // Try to load the last selected note
                await this.openFile(lastSelectedNote);
            } catch (error) {
                console.log('Last selected note not found, loading welcome content');
                // The file may not exist anymore, clear localStorage and load welcome
                localStorage.removeItem('lastSelectedNote');
                this.loadWelcomeContent();
            }
        } else {
            // No previous selection, load welcome content
            this.loadWelcomeContent();
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NotesApp();
});
