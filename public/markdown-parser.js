class MarkdownParser {
    constructor() {
        this.rules = [
            // Headers
            { pattern: /^### (.*$)/gm, replacement: '<h3>$1</h3>' },
            { pattern: /^## (.*$)/gm, replacement: '<h2>$1</h2>' },
            { pattern: /^# (.*$)/gm, replacement: '<h1>$1</h1>' },

            // Bold and Italic
            { pattern: /\*\*\*(.*?)\*\*\*/g, replacement: '<strong><em>$1</em></strong>' },
            { pattern: /\*\*(.*?)\*\*/g, replacement: '<strong>$1</strong>' },
            { pattern: /\*(.*?)\*/g, replacement: '<em>$1</em>' },

            // Strikethrough
            { pattern: /~~(.*?)~~/g, replacement: '<del>$1</del>' },

            // Inline code
            { pattern: /`([^`]+)`/g, replacement: '<code>$1</code>' },

            // Links
            { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replacement: '<a href="$2" target="_blank">$1</a>' },

            // Images
            { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, replacement: '<img src="$2" alt="$1" />' },

            // Horizontal rules
            { pattern: /^---$/gm, replacement: '<hr>' },
            { pattern: /^\*\*\*$/gm, replacement: '<hr>' },

            // Line breaks
            { pattern: /\n\n/g, replacement: '</p><p>' },
            { pattern: /\n/g, replacement: '<br>' }
        ];
    }

    parse(markdown) {
        if (!markdown) return '';

        // Handle code blocks first (to prevent processing markdown inside them)
        let html = this.parseCodeBlocks(markdown);

        // Handle blockquotes
        html = this.parseBlockquotes(html);

        // Handle lists
        html = this.parseLists(html);

        // Apply markdown rules EXCEPT line breaks first
        for (const rule of this.rules) {
            // Skip line break rules for now
            if (rule.pattern.source !== '\\n\\n' && rule.pattern.source !== '\\n') {
                html = html.replace(rule.pattern, rule.replacement);
            }
        }

        // Handle line breaks more carefully - only convert newlines that aren't
        // already part of block elements or immediately after colons/list headers
        html = html.replace(/\n\n/g, '</p><p>');

        // Split by lines and handle newlines more selectively
        const lines = html.split('\n');
        const processedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            const nextLine = lines[i + 1];

            processedLines.push(currentLine);

            // Only add <br> if:
            // - There's a next line
            // - Current line doesn't end with a colon
            // - Next line doesn't start with list markers, headings, or HTML tags
            // - We're not at the end
            if (nextLine !== undefined &&
                !currentLine.trim().endsWith(':') &&
                !nextLine.trim().match(/^[-*+\d#>]|\s*</) &&
                nextLine.trim() !== '') {
                processedLines.push('<br>');
            }
        }

        html = processedLines.join('\n').replace(/\n/g, '');

        // Escape remaining HTML that wasn't converted to markdown
        html = this.escapeRemainingHtml(html);

        // Wrap in paragraphs
        html = '<p>' + html + '</p>';

        // Clean up empty paragraphs and fix paragraph nesting
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>(<h[1-6]>)/g, '$1');
        html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
        html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ul>)/g, '$1');
        html = html.replace(/(<\/ul>)<\/p>/g, '$1');
        html = html.replace(/<p>(<ol>)/g, '$1');
        html = html.replace(/(<\/ol>)<\/p>/g, '$1');
        html = html.replace(/<p>(<blockquote>)/g, '$1');
        html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRemainingHtml(html) {
        // Only escape HTML that's not part of our generated markdown tags
        return html.replace(/</g, function(match, offset, string) {
            // Don't escape if it's part of our generated HTML tags
            if (string.substr(offset).match(/^<(\/?(h[1-6]|p|strong|em|del|code|pre|ul|ol|li|blockquote|a|img|hr)(\s[^>]*)?\/?)>/)) {
                return match;
            }
            return '&lt;';
        }).replace(/>/g, function(match, offset, string) {
            // Don't escape if it's part of our generated HTML tags
            if (string.substr(0, offset + 1).match(/<(\/?(h[1-6]|p|strong|em|del|code|pre|ul|ol|li|blockquote|a|img|hr)(\s[^>]*)?\/?)>$/)) {
                return match;
            }
            return '&gt;';
        });
    }

    parseCodeBlocks(html) {
        // Handle fenced code blocks
        html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${code.trim()}</code></pre>`;
        });

        // Handle indented code blocks (4 spaces)
        html = html.replace(/^(    .+)$/gm, (match, code) => {
            return `<pre><code>${code.substring(4)}</code></pre>`;
        });

        return html;
    }

    parseBlockquotes(html) {
        const lines = html.split('\n');
        const result = [];
        let inBlockquote = false;
        let blockquoteContent = [];

        for (let line of lines) {
            if (line.trim().startsWith('&gt; ')) {
                if (!inBlockquote) {
                    inBlockquote = true;
                    blockquoteContent = [];
                }
                blockquoteContent.push(line.trim().substring(5)); // Remove '&gt; '
            } else {
                if (inBlockquote) {
                    result.push(`<blockquote>${blockquoteContent.join('<br>')}</blockquote>`);
                    inBlockquote = false;
                    blockquoteContent = [];
                }
                result.push(line);
            }
        }

        // Handle blockquote at end of content
        if (inBlockquote) {
            result.push(`<blockquote>${blockquoteContent.join('<br>')}</blockquote>`);
        }

        return result.join('\n');
    }

    parseLists(html) {
        const lines = html.split('\n');
        const result = [];
        let inUnorderedList = false;
        let inOrderedList = false;
        let listItems = [];

        for (let line of lines) {
            const trimmedLine = line.trim();

            // Unordered list
            if (trimmedLine.match(/^[-*+] /)) {
                if (inOrderedList) {
                    result.push(`<ol>${listItems.join('')}</ol>`);
                    inOrderedList = false;
                    listItems = [];
                }
                if (!inUnorderedList) {
                    inUnorderedList = true;
                    listItems = [];
                }
                listItems.push(`<li>${trimmedLine.substring(2)}</li>`);
            }
            // Ordered list
            else if (trimmedLine.match(/^\d+\. /)) {
                if (inUnorderedList) {
                    result.push(`<ul>${listItems.join('')}</ul>`);
                    inUnorderedList = false;
                    listItems = [];
                }
                if (!inOrderedList) {
                    inOrderedList = true;
                    listItems = [];
                }
                const match = trimmedLine.match(/^\d+\. (.+)/);
                listItems.push(`<li>${match[1]}</li>`);
            }
            // Not a list item
            else {
                if (inUnorderedList) {
                    result.push(`<ul>${listItems.join('')}</ul>`);
                    inUnorderedList = false;
                    listItems = [];
                }
                if (inOrderedList) {
                    result.push(`<ol>${listItems.join('')}</ol>`);
                    inOrderedList = false;
                    listItems = [];
                }
                result.push(line);
            }
        }

        // Handle lists at end of content
        if (inUnorderedList) {
            result.push(`<ul>${listItems.join('')}</ul>`);
        }
        if (inOrderedList) {
            result.push(`<ol>${listItems.join('')}</ol>`);
        }

        return result.join('\n');
    }
}

// Make it available globally
window.MarkdownParser = MarkdownParser;
