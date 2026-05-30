import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import * as crypto from 'crypto';

const P_TITLE = 'SnippetShot';

async function writeSerializedBlobToFile(serializedBlob: string, uri: vscode.Uri) {
  const bytes = new Uint8Array(serializedBlob.split(',').map((n) => Number(n)));
  await vscode.workspace.fs.writeFile(uri, bytes);
}

function generateFilename(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `codesnippet-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}

export function activate(context: vscode.ExtensionContext) {
  const htmlPath = path.resolve(context.extensionPath, 'webview/index.html');

  let panel: vscode.WebviewPanel | undefined;

  const serializer: vscode.WebviewPanelSerializer = {
    async deserializeWebviewPanel(_panel: vscode.WebviewPanel, state: { innerHTML?: string }) {
      panel = _panel;
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview')),
          vscode.Uri.file(path.join(context.extensionPath, 'out')),
        ],
      };
      panel.webview.html = getHtmlContent(htmlPath, panel.webview);
      panel.webview.postMessage({
        type: 'restore',
        innerHTML: state?.innerHTML,
        bgColor: context.globalState.get('snippetshot.bgColor'),
      });
      const selectionListener = setupSelectionSync(panel);
      panel.onDidDispose(() => selectionListener.dispose());
      setupMessageListeners(panel);
    },
  };
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('snippetshot', serializer)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snippetshot.activate', () => {
      panel = vscode.window.createWebviewPanel('snippetshot', P_TITLE, vscode.ViewColumn.Two, {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webview')),
          vscode.Uri.file(path.join(context.extensionPath, 'out')),
        ],
      });

      panel.webview.html = getHtmlContent(htmlPath, panel.webview);

      const selectionListener = setupSelectionSync(panel);
      panel.onDidDispose(() => selectionListener.dispose());

      setupMessageListeners(panel);

      const fontFamily = vscode.workspace.getConfiguration('editor').get<string>('fontFamily');
      const bgColor = context.globalState.get('snippetshot.bgColor');
      panel.webview.postMessage({
        type: 'init',
        fontFamily,
        bgColor,
      });

      syncSettings(panel);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('snippetshot.save', () => {
      if (panel) {
        panel.webview.postMessage({ type: 'save' });
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('snippetshot') || e.affectsConfiguration('editor')) {
        if (panel) {
          syncSettings(panel);
        }
      }
    })
  );

  function setupMessageListeners(p: vscode.WebviewPanel) {
    p.webview.onDidReceiveMessage(({ type, data }) => {
      switch (type) {
        case 'shoot': {
          const defaultName = generateFilename(new Date());
          vscode.window
            .showSaveDialog({
              defaultUri: vscode.Uri.file(path.resolve(homedir(), 'Downloads', defaultName)),
              filters: { Images: ['png'] },
              saveLabel: 'Save SnippetShot',
            })
            .then(async (uri) => {
              if (!uri) {
                p.webview.postMessage({ type: 'saveError', message: 'Save canceled' });
                return;
              }
              try {
                await writeSerializedBlobToFile(data.serializedBlob, uri);
                p.webview.postMessage({
                  type: 'saveSuccess',
                  fileName: path.basename(uri.fsPath),
                  filePath: uri.fsPath,
                });
                vscode.window.showInformationMessage(`Saved: ${path.basename(uri.fsPath)}`);
              } catch (err) {
                p.webview.postMessage({
                  type: 'saveError',
                  message: (err as Error)?.message || String(err),
                });
                vscode.window.showErrorMessage('Failed to save image: ' + (err as Error).message);
              }
            });
          break;
        }
        case 'updateSettingsFromWebview':
          // Removed attribution caching (no action needed)
          break;
        case 'getAndUpdateCacheAndSettings':
          p.webview.postMessage({
            type: 'restoreBgColor',
            bgColor: context.globalState.get('snippetshot.bgColor'),
          });
          syncSettings(p);
          break;
        case 'updateBgColor':
          context.globalState.update('snippetshot.bgColor', data.bgColor);
          break;
        case 'updateBgSettings':
          context.globalState.update('snippetshot.bgColor', data.bgColor);
          break;
        case 'updateWindowControls':
          vscode.workspace
            .getConfiguration('snippetshot')
            .update('windowControlsEnabled', data.enabled, vscode.ConfigurationTarget.Global);
          break;
        case 'copySuccess':
          vscode.window.showInformationMessage(data.message || 'Screenshot copied to clipboard!');
          break;
        case 'copyError':
          vscode.window.showErrorMessage(data.message || 'Failed to copy screenshot to clipboard');
          break;
        case 'exportError':
          vscode.window.showErrorMessage(data.message || 'Screenshot export failed');
          break;
      }
    });
  }

  function syncSettings(p: vscode.WebviewPanel) {
    const settings = vscode.workspace.getConfiguration('snippetshot');
    const editorSettings = vscode.workspace.getConfiguration('editor', null);
    p.webview.postMessage({
      type: 'updateSettings',
      shadow: settings.get('shadow'),
      backgroundColor: settings.get('backgroundColor'),
      attributionEnabled: settings.get('attributionEnabled'),
      attributionText: settings.get('attributionText'),
      windowControlsEnabled: settings.get('windowControlsEnabled'),
      ligature: editorSettings.get('fontLigatures'),
    });
  }
}

function getHtmlContent(htmlPath: string, webview: vscode.Webview) {
  const raw = fs.readFileSync(htmlPath, 'utf-8');
  const nonce = crypto.randomBytes(16).toString('base64');

  const basePath = path.dirname(htmlPath);
  const extensionPath = path.resolve(basePath, '..');
  const stylesUri = webview.asWebviewUri(vscode.Uri.file(path.resolve(basePath, 'styles.css')));
  const indexUri = webview.asWebviewUri(
    vscode.Uri.file(path.resolve(extensionPath, 'out/webview.js'))
  );

  return raw
    .replace(/{{nonce}}/g, nonce)
    .replace('{{stylesUri}}', stylesUri.toString())
    .replace('{{indexUri}}', indexUri.toString());
}

export function deactivate() {}

function setupSelectionSync(panel: vscode.WebviewPanel) {
  return vscode.window.onDidChangeTextEditorSelection((e) => {
    if (e.selections[0] && !e.selections[0].isEmpty) {
      vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
      panel.webview.postMessage({ type: 'update' });
    }
  });
}
