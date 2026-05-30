import * as htmlToImage from 'html-to-image';

(function () {
  const vscode = acquireVsCodeApi();
  let backgroundColor = '#020617';

  vscode.postMessage({ type: 'getAndUpdateCacheAndSettings' });
  const snippetNode = document.getElementById('snippet');
  const snippetContainerNode = document.getElementById('snippet-container');
  const saveBtn = document.getElementById('saveBtn');
  const saveBtnText = document.getElementById('saveBtnText');
  const shareBtn = document.getElementById('shareBtn');
  const shareBtnText = document.getElementById('shareBtnText');
  const bgPicker = document.getElementById('bgPicker');
  const lineNumbersCheckbox = document.getElementById('lineNumbers');
  const attributionEnabled = document.getElementById('attributionEnabled');
  const attributionText = document.getElementById('attributionText');
  const attributionOverlay = document.getElementById('attribution-overlay');

  const oldState = vscode.getState();
  if (oldState && oldState.innerHTML) {
    snippetNode.innerHTML = oldState.innerHTML;
  }

  updateBackground();

  const initialTemplate = document.getElementById('initial-snippet-template');
  function applyInitialSnippet() {
    if (initialTemplate && 'content' in initialTemplate) {
      snippetNode.innerHTML = '';
      snippetNode.appendChild(initialTemplate.content.cloneNode(true));
    }
  }

  const serializeBlob = (blob, cb) => {
    const fileReader = new FileReader();

    fileReader.onload = () => {
      const bytes = new Uint8Array(fileReader.result);
      cb(Array.from(bytes).join(','));
    };

    fileReader.onerror = () => {
      saveBtn.disabled = false;
      saveBtnText.textContent = 'Save as PNG';
    };

    fileReader.readAsArrayBuffer(blob);
  };

  function getBackgroundValue() {
    return backgroundColor;
  }

  function updateBackground() {
    const bgValue = getBackgroundValue();
    document.body.style.background = bgValue;
    vscode.postMessage({
      type: 'updateBgSettings',
      data: {
        bgColor: backgroundColor,
      },
    });
  }

  function applyExportStyles() {
    if (snippetContainerNode) {
      snippetContainerNode.classList.add('export-mode');
      snippetContainerNode.style.background = getBackgroundValue();
    }
    if (snippetNode) {
      snippetNode.classList.add('export-mode');
    }

    return function restore() {
      if (snippetContainerNode) {
        snippetContainerNode.classList.remove('export-mode');
        snippetContainerNode.style.background = '';
      }
      if (snippetNode) {
        snippetNode.classList.remove('export-mode');
      }
    };
  }

  function shoot(serializedBlob) {
    vscode.postMessage({
      type: 'shoot',
      data: {
        serializedBlob,
      },
    });
  }

  function getSnippetBgColor(html) {
    const match = html.match(/background-color: (#[a-fA-F0-9]+)/);
    return match ? match[1] : undefined;
  }

  function updateEnvironment(snippetBgColor) {
    if (snippetBgColor) {
      document.getElementById('snippet').style.backgroundColor = snippetBgColor;
    }
  }

  bgPicker.addEventListener('input', () => {
    backgroundColor = bgPicker.value;
    updateBackground();
  });

  attributionEnabled.addEventListener('change', () => {
    updateAttribution();
  });

  attributionText.addEventListener('input', () => {
    updateAttribution();
  });

  attributionText.addEventListener('paste', (e) => {
    e.stopPropagation();
  });

  function updateAttribution() {
    if (attributionEnabled.checked) {
      attributionOverlay.textContent = attributionText.value || 'SnippetShot';
      attributionOverlay.style.display = 'block';
    } else {
      attributionOverlay.style.display = 'none';
    }
  }

  lineNumbersCheckbox.addEventListener('change', () => {
    toggleLineNumbers(lineNumbersCheckbox.checked);
  });

  function toggleLineNumbers(show) {
    const snippet = document.getElementById('snippet');
    if (!snippet) return;

    const lineContainer = snippet.querySelector('div');
    if (!lineContainer) return;

    const existingNumbers = snippet.querySelectorAll('.line-number');
    if (show && existingNumbers.length > 0) return;
    if (!show && existingNumbers.length === 0) return;
    existingNumbers.forEach((n) => n.remove());

    const allLines = Array.from(snippet.querySelectorAll('div > div'));
    allLines.forEach((l) => {
      l.classList.remove('line-numbered');
    });

    if (show) {
      const lines = Array.from(lineContainer.children).filter((c) => c.tagName === 'DIV');
      lines.forEach((line, i) => {
        const number = document.createElement('span');
        number.className = 'line-number';
        number.innerText = i + 1;
        line.classList.add('line-numbered');
        line.prepend(number);
      });
    }
  }

  function getMinIndent(code) {
    const arr = code.split('\n');

    let minIndentCount = Number.MAX_VALUE;
    for (let i = 0; i < arr.length; i++) {
      const wsCount = arr[i].search(/\S/);
      if (wsCount !== -1) {
        if (wsCount < minIndentCount) {
          minIndentCount = wsCount;
        }
      }
    }

    return minIndentCount;
  }

  function stripInitialIndent(html, indent) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const initialSpans = doc.querySelectorAll('div > div span:first-child');
    for (let i = 0; i < initialSpans.length; i++) {
      initialSpans[i].textContent = initialSpans[i].textContent.slice(indent);
    }
    return doc.body.innerHTML;
  }
  function createPlainTextSnippet(text) {
    const maxLineLength = 120;
    const lines = text.split('\n').map((line) => {
      if (line.length > maxLineLength) {
        return line.substring(0, maxLineLength) + '...';
      }
      return line;
    });

    const container = document.createElement('div');
    lines.forEach((line) => {
      const lineDiv = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = line || ' ';
      lineDiv.appendChild(span);
      container.appendChild(lineDiv);
    });

    return container.innerHTML;
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const allowedTags = ['DIV', 'SPAN', 'BR', 'B', 'I', 'U', 'EM', 'STRONG', 'CODE'];

    function cleanNode(node) {
      if (node.nodeType === 1) {
        if (!allowedTags.includes(node.tagName)) {
          const text = document.createTextNode(node.textContent || '');
          node.parentNode.replaceChild(text, node);
          return;
        }
        const attrs = Array.from(node.attributes);
        for (const attr of attrs) {
          if (attr.name !== 'style' && attr.name !== 'class') {
            node.removeAttribute(attr.name);
          }
        }
      }
      const children = Array.from(node.childNodes);
      for (const child of children) {
        cleanNode(child);
      }
    }

    const children = Array.from(doc.body.childNodes);
    for (const child of children) {
      cleanNode(child);
    }
    return doc.body.innerHTML;
  }

  document.addEventListener('paste', (e) => {
    const innerHTML = e.clipboardData.getData('text/html');
    const code = e.clipboardData.getData('text/plain');

    let content;
    if (innerHTML && innerHTML.trim()) {
      const minIndent = getMinIndent(code);
      const snippetBgColor = getSnippetBgColor(innerHTML);
      if (snippetBgColor) updateEnvironment(snippetBgColor);
      let processedHtml = minIndent !== 0 ? stripInitialIndent(innerHTML, minIndent) : innerHTML;
      content = sanitizeHtml(processedHtml);
    } else if (code && code.trim()) {
      content = sanitizeHtml(createPlainTextSnippet(code));
    } else {
      return;
    }

    snippetNode.innerHTML = content;
    vscode.setState({ innerHTML: content });
    toggleLineNumbers(lineNumbersCheckbox.checked);
  });

  document.addEventListener('keydown', (e) => {
    try {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+S (Cmd+Shift+S) for share
          if (!shareBtn.disabled) {
            shareBtn.click();
          }
        } else {
          // Ctrl+S (Cmd+S) for save
          if (!saveBtn.disabled) {
            saveBtn.click();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          e.preventDefault();
          copyScreenshotToClipboard();
        }
      }
    } catch {
      vscode.postMessage({
        type: 'exportError',
        message: 'Keyboard shortcut failed. Please use the buttons instead.',
      });
    }
  });

  function copyScreenshotToClipboard() {
    if (saveBtn.disabled) return;

    saveBtn.disabled = true;
    saveBtnText.textContent = 'Copying…';

    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: 'Copy operation timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();
    const config = {
      backgroundColor: backgroundColor,
      filter: (node) => {
        return !node.classList || !node.classList.contains('toolbar');
      },
    };

    htmlToImage
      .toBlob(snippetContainerNode || document.querySelector('#snippet').parentElement, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (blob) {
          if (!navigator.clipboard || !window.ClipboardItem) {
            saveBtnText.textContent = 'Save as PNG';
            vscode.postMessage({
              type: 'copyError',
              message: 'Clipboard API not supported. Try saving as file instead.',
            });
            restore();
            saveBtn.disabled = false;
            return;
          }
          navigator.clipboard
            .write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ])
            .then(() => {
              saveBtnText.textContent = 'Copied!';
              setTimeout(() => {
                saveBtnText.textContent = 'Save as PNG';
              }, 2000);
              vscode.postMessage({
                type: 'copySuccess',
                message: 'Screenshot copied to clipboard!',
              });
            })
            .catch((_error) => {
              saveBtnText.textContent = 'Save as PNG';
              vscode.postMessage({
                type: 'copyError',
                message: 'Failed to copy to clipboard. Try saving as file instead.',
              });
            })
            .finally(() => {
              restore();
              saveBtn.disabled = false;
            });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        restore();
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'copyError',
          message: `Copy failed: ${error.message || 'Unknown error'}`,
        });
      });
  }

  let saveLabelTimer = null;
  saveBtn.addEventListener('click', () => {
    shootAll();
  });

  shareBtn.addEventListener('click', () => {
    shareToTwitter();
  });

  function shareToTwitter() {
    if (shareBtn.disabled || saveBtn.disabled) return;

    shareBtn.disabled = true;
    shareBtnText.textContent = 'Generating…';

    const safetyTimeout = setTimeout(() => {
      if (shareBtn.disabled) {
        shareBtn.disabled = false;
        shareBtnText.textContent = 'Share to X';
        vscode.postMessage({
          type: 'shareError',
          message: 'Share operation timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();
    const config = {
      backgroundColor: backgroundColor,
      filter: (node) => {
        return !node.classList || !node.classList.contains('toolbar');
      },
    };

    const target = snippetContainerNode || document.querySelector('#snippet').parentElement;
    if (target && target.classList) target.classList.remove('capture-flash');

    htmlToImage
      .toBlob(target, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (target && target.classList) {
          void target.offsetWidth;
          target.classList.add('capture-flash');
        }
        if (blob) {
          if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard
              .write([
                new ClipboardItem({
                  'image/png': blob,
                }),
              ])
              .then(() => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = reader.result.split(',')[1];
                  vscode.postMessage({
                    type: 'shareToTwitter',
                    data: {
                      imageData: base64,
                      text: 'Check out this code snippet! Created with #SnippetShot 📸',
                      imageCopiedToClipboard: true,
                    },
                  });
                };
                reader.readAsDataURL(blob);
              })
              .catch(() => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = reader.result.split(',')[1];
                  vscode.postMessage({
                    type: 'shareToTwitter',
                    data: {
                      imageData: base64,
                      text: 'Check out this code snippet! Created with #SnippetShot 📸',
                      imageCopiedToClipboard: false,
                    },
                  });
                };
                reader.readAsDataURL(blob);
              });
          } else {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result.split(',')[1];
              vscode.postMessage({
                type: 'shareToTwitter',
                data: {
                  imageData: base64,
                  text: 'Check out this code snippet! Created with #SnippetShot 📸',
                  imageCopiedToClipboard: false,
                },
              });
            };
            reader.readAsDataURL(blob);
          }
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        if (target && target.classList) target.classList.remove('capture-flash');
        shareBtn.disabled = false;
        shareBtnText.textContent = 'Share to X';

        const errorMessage = error.message || 'Unknown error occurred';
        vscode.postMessage({
          type: 'shareError',
          message: `Failed to generate image for sharing: ${errorMessage}. Please try again.`,
        });
      })
      .finally(() => {
        restore();
      });
  }

  function shootAll() {
    if (saveBtn.disabled) return;

    saveBtnText.textContent = 'Saving…';
    saveBtn.disabled = true;

    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';
        vscode.postMessage({
          type: 'exportError',
          message: 'Screenshot capture timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();
    const config = {
      backgroundColor: backgroundColor,
      filter: (node) => {
        return !node.classList || !node.classList.contains('toolbar');
      },
    };

    const target = snippetContainerNode || document.querySelector('#snippet').parentElement;
    if (target && target.classList) target.classList.remove('capture-flash');

    htmlToImage
      .toBlob(target, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (target && target.classList) {
          void target.offsetWidth;
          target.classList.add('capture-flash');
        }
        if (blob) {
          serializeBlob(blob, (serializedBlob) => {
            shoot(serializedBlob);
          });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        if (target && target.classList) target.classList.remove('capture-flash');
        saveBtn.disabled = false;
        saveBtnText.textContent = 'Save as PNG';

        const errorMessage = error.message || 'Unknown error occurred';
        vscode.postMessage({
          type: 'exportError',
          message: `Screenshot capture failed: ${errorMessage}. Please try again.`,
        });
      })
      .finally(() => {
        restore();
      });
  }

  function updateStateUI(data) {
    if (data.bgColor) {
      backgroundColor = data.bgColor;
      bgPicker.value = data.bgColor;
    }
    updateBackground();
  }

  window.addEventListener('message', (e) => {
    if (e) {
      if (e.data.type === 'init') {
        applyInitialSnippet();
        vscode.setState({ innerHTML: snippetNode.innerHTML });
        toggleLineNumbers(lineNumbersCheckbox.checked);
        updateStateUI(e.data);
      } else if (e.data.type === 'update') {
        document.execCommand('paste');
      } else if (e.data.type === 'restore') {
        snippetNode.innerHTML = e.data.innerHTML;
        toggleLineNumbers(lineNumbersCheckbox.checked);
        updateStateUI(e.data);
      } else if (e.data.type === 'restoreBgColor') {
        updateStateUI(e.data);
      } else if (e.data.type === 'updateSettings') {
        snippetNode.style.boxShadow = e.data.shadow;
        if (e.data.attributionEnabled !== undefined) {
          attributionEnabled.checked = e.data.attributionEnabled;
        }
        if (e.data.attributionText) {
          attributionText.value = e.data.attributionText;
        }
        updateAttribution();
        if (e.data.ligature) {
          snippetNode.style.fontVariantLigatures = 'normal';
        } else {
          snippetNode.style.fontVariantLigatures = 'none';
        }
      } else if (e.data.type === 'save') {
        shootAll();
      } else if (e.data.type === 'saveSuccess') {
        saveBtnText.textContent = 'Saved!';
        saveBtn.disabled = false;
        if (saveLabelTimer) {
          clearTimeout(saveLabelTimer);
        }
        saveLabelTimer = setTimeout(() => {
          saveBtnText.textContent = 'Save as PNG';
        }, 2000);
      } else if (e.data.type === 'saveError') {
        saveBtnText.textContent = 'Save as PNG';
        saveBtn.disabled = false;
      } else if (e.data.type === 'shareSuccess') {
        shareBtnText.textContent = 'Ready to paste!';
        shareBtn.classList.add('ready-to-paste');
        shareBtn.disabled = false;
        setTimeout(() => {
          shareBtnText.textContent = 'Share to X';
          shareBtn.classList.remove('ready-to-paste');
        }, 5000);
      } else if (e.data.type === 'shareError') {
        shareBtnText.textContent = 'Share to X';
        shareBtn.classList.remove('ready-to-paste');
        shareBtn.disabled = false;
      }
    }
  });
})();
