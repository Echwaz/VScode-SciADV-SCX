
const vscode = require("vscode");

let panel = undefined;
let currentDocument = undefined;
let changeDisposable = undefined;

function activate(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand("scx.openPreview", () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage("Open an SCX TXT file first.");
                return;
            }

            currentDocument = editor.document;

            if (panel) {
                panel.reveal(vscode.ViewColumn.Beside);
                updatePreview();
                return;
            }

            panel = vscode.window.createWebviewPanel(
                "scxPreview",
                "SCX Preview",
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.onDidDispose(() => {
                panel = undefined;
                currentDocument = undefined;
                if (changeDisposable) {
                    changeDisposable.dispose();
                    changeDisposable = undefined;
                }
            }, null, context.subscriptions);

            changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
                if (!currentDocument || event.document.uri.toString() !== currentDocument.uri.toString()) {
                    return;
                }
                updatePreview();
            });

            context.subscriptions.push(
                vscode.window.onDidChangeActiveTextEditor((editor) => {
                    if (panel && editor) {
                        currentDocument = editor.document;
                        updatePreview();
                    }
                })
            );

            updatePreview();
        }),

        vscode.commands.registerCommand("scx.refreshPreview", () => {
            updatePreview();
        })
    );
}

function updatePreview() {
    if (!panel || !currentDocument) return;

    const source = currentDocument.getText();
    panel.title = `Preview: ${pathBase(currentDocument.fileName)}`;
    panel.webview.html = buildHtml(source, currentDocument.fileName);
}

function pathBase(fileName) {
    const parts = fileName.split(/[\\/]/);
    return parts[parts.length - 1];
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function parseScx(source) {
    const lines = source.split(/\r?\n/);
    const blocks = [];

    for (const raw of lines) {
        let line = raw;

        // Speaker format: [name]Speaker[line]Dialogue...
        const speakerMatch = line.match(/^\[name\]([^\[]*)\[line\](.*)$/);
        if (speakerMatch) {
            const speaker = speakerMatch[1].trim();
            const dialogue = stripTags(speakerMatch[2]).trim();

            blocks.push({
                type: "dialogue",
                speaker,
                text: dialogue
            });
            continue;
        }

        const text = stripTags(line).trim();

        if (!text) {
            blocks.push({ type: "blank" });
        } else {
            blocks.push({ type: "text", text });
        }
    }

    return blocks;
}

function stripTags(text) {
    return text
        // MAGES formatting/control tags
        .replace(/\[(?:center|left|right)\]/gi, "")
        .replace(/\[margin(?:\s+[^\]]*)?\]/gi, "")
        .replace(/\[evaluate(?:\s+[^\]]*)?\]/gi, "")
        .replace(/\[color(?:\s+[^\]]*)?\]/gi, "")
        .replace(/\[%[a-zA-Z0-9_]+\]/g, "")
        // Any remaining bracket command. Kept conservative so ordinary [text] is not
        // accidentally destroyed unless it looks like a known SCX command.
        .replace(/\[(?:name|line)(?:\s+[^\]]*)?\]/gi, "")
        .trim();
}

function buildHtml(source, fileName) {
    const blocks = parseScx(source);

    const body = blocks.map(block => {
        if (block.type === "blank") {
            return `<div class="blank"></div>`;
        }

        if (block.type === "dialogue") {
            return `
                <section class="dialogue">
                    <div class="speaker">${escapeHtml(block.speaker)}</div>
                    <div class="text">${escapeHtml(block.text)}</div>
                </section>
            `;
        }

        return `<section class="narration">${escapeHtml(block.text)}</section>`;
    }).join("");

    return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline';"
>
<style>
    :root {
        color-scheme: light dark;
    }

    body {
        padding: 28px 34px 80px;
        font-family: var(--vscode-editor-font-family, "Segoe UI", sans-serif);
        font-size: var(--vscode-editor-font-size, 14px);
        line-height: 1.75;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
        max-width: 900px;
        margin: 0 auto;
    }

    .file {
        position: sticky;
        top: 0;
        padding: 8px 0 18px;
        margin-bottom: 18px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
        z-index: 2;
    }

    section {
        margin: 0 0 18px;
    }

    .dialogue {
        margin: 0 0 22px;
    }

    .speaker {
        font-weight: 700;
        color: var(--vscode-textLink-foreground);
        margin-bottom: 2px;
    }

    .text, .narration {
        white-space: pre-wrap;
    }

    .blank {
        height: 12px;
    }

    .empty {
        color: var(--vscode-descriptionForeground);
        font-style: italic;
        padding-top: 30px;
    }
</style>
</head>
<body>
    <div class="file">${escapeHtml(fileName)}</div>
    ${body || `<div class="empty">No visible text.</div>`}
</body>
</html>`;
}

function deactivate() {
    if (changeDisposable) {
        changeDisposable.dispose();
        changeDisposable = undefined;
    }
}

module.exports = {
    activate,
    deactivate
};
