import * as htmlToImage from 'html-to-image';

(function () {
  const vscode = acquireVsCodeApi();
  const bgPresets = {
    sunset: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)',
    ocean: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    cyber: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    aurora: 'linear-gradient(135deg, #ff758c 0%, #ff7c00 100%)',
    emerald: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    dark: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    candy: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
    royal: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    citrus: 'linear-gradient(135deg, #fddb92 0%, #d1f2a5 100%)',
    glass: 'rgba(255, 255, 255, 0.08)',
  };

  let backgroundColor = bgPresets.sunset;
  const exportPixelRatio = 2;
  let lineNumbersEnabled = true;
  let saveLabelTimer = null;

  const snippetNode = document.getElementById('snippet');
  const snippetContainerNode = document.getElementById('snippet-container');
  const saveBtn = document.getElementById('saveBtn');
  const saveBtnText = document.getElementById('saveBtnText');
  const copyBtn = document.getElementById('copyBtn');
  const copyBtnText = document.getElementById('copyBtnText');

  const quickBgBtn = document.getElementById('quickBgBtn');
  const lineNoBtn = document.getElementById('lineNoBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPopover = document.getElementById('settings-popover');

  const bgPicker = document.getElementById('bgPicker');
  const bgHex = document.getElementById('bgHex');
  const windowTitleContainer = document.getElementById('window-title-container');
  const breadcrumbDisplay = document.getElementById('breadcrumb-display');
  const bottomStatusContainer = document.getElementById('bottom-status-container');
  const bottomStatusTab = document.getElementById('bottom-status-tab');
  const bottomStatusInput = document.getElementById('bottom-status-input');

  const attributionEnabled = document.getElementById('attributionEnabled');
  const toggleBreadcrumbs = document.getElementById('toggleBreadcrumbs');

  lineNoBtn.classList.add('active');

  let currentFilePath = 'snippet.txt';
  let currentLanguageId = 'plaintext';
  let lastReceivedFilePath = 'snippet.txt';
  let lastReceivedLanguageId = 'plaintext';

  function updatePathMetadata(filePath, languageId) {
    currentFilePath = filePath;
    currentLanguageId = languageId;
    const parts = filePath.replace(/\\/g, '/').split('/');
    const filename = parts.pop();
    breadcrumbDisplay.innerHTML = '';
    parts.forEach((part) => {
      if (!part) return;
      const segSpan = document.createElement('span');
      segSpan.className = 'path-segment';
      segSpan.innerText = part;
      breadcrumbDisplay.appendChild(segSpan);
      const sepSpan = document.createElement('span');
      sepSpan.className = 'path-separator';
      sepSpan.innerText = ' > ';
      breadcrumbDisplay.appendChild(sepSpan);
    });
    const fileSpan = document.createElement('span');
    fileSpan.className = 'filename';
    fileSpan.innerText = filename;
    breadcrumbDisplay.appendChild(fileSpan);
    const currentState = vscode.getState() || {};
    vscode.setState({
      ...currentState,
      filePath,
      languageId,
    });
  }

  const oldState = vscode.getState();
  if (oldState && oldState.innerHTML) {
    snippetNode.innerHTML = oldState.innerHTML;
  }
  if (oldState && oldState.filePath) {
    currentFilePath = oldState.filePath;
    currentLanguageId = oldState.languageId || 'plaintext';
  }
  updatePathMetadata(currentFilePath, currentLanguageId);

  if (oldState) {
    if (oldState.breadcrumbsVisible !== undefined) {
      toggleBreadcrumbs.checked = oldState.breadcrumbsVisible;
      windowTitleContainer.style.display = oldState.breadcrumbsVisible ? 'flex' : 'none';
    }
    if (oldState.attributionEnabled !== undefined) {
      attributionEnabled.checked = oldState.attributionEnabled;
      bottomStatusContainer.style.display = oldState.attributionEnabled ? 'block' : 'none';
    }
  }

  vscode.postMessage({ type: 'getAndUpdateCacheAndSettings' });

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
      resetExportButtons();
    };
    fileReader.readAsArrayBuffer(blob);
  };

  function applyBackground(val) {
    if (!val) return;
    backgroundColor = val;
    if (snippetContainerNode) {
      snippetContainerNode.style.background = val;
    }

    if (val.startsWith('#')) {
      bgPicker.value = val;
      bgHex.textContent = val.toUpperCase();
    } else {
      let matchingKey = null;
      for (const [key, value] of Object.entries(bgPresets)) {
        if (value === val) {
          matchingKey = key;
          break;
        }
      }
      bgHex.textContent = matchingKey
        ? matchingKey.charAt(0).toUpperCase() + matchingKey.slice(1)
        : 'Gradient';
    }

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
    }
    if (snippetNode) {
      snippetNode.classList.add('export-mode');
    }

    return function restore() {
      if (snippetContainerNode) {
        snippetContainerNode.classList.remove('export-mode');
      }
      if (snippetNode) {
        snippetNode.classList.remove('export-mode');
      }
    };
  }

  function getSnippetBgColor(html) {
    const match = html.match(/background-color: (#[a-fA-F0-9]+)/);
    return match ? match[1] : undefined;
  }

  function updateEnvironment(snippetBgColor) {
    if (snippetBgColor && snippetNode) {
      snippetNode.style.backgroundColor = snippetBgColor;
    }
  }

  const presetKeys = Object.keys(bgPresets);
  quickBgBtn.addEventListener('click', () => {
    let currentIndex = presetKeys.findIndex((key) => bgPresets[key] === backgroundColor);
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = (currentIndex + 1) % presetKeys.length;
    const nextKey = presetKeys[nextIndex];

    document.querySelectorAll('.preset-circle').forEach((circle) => {
      const active = circle.dataset.bg === nextKey;
      circle.classList.toggle('active', active);
    });

    applyBackground(bgPresets[nextKey]);
  });

  document.querySelectorAll('.preset-circle').forEach((circle) => {
    circle.addEventListener('click', () => {
      document.querySelectorAll('.preset-circle').forEach((c) => c.classList.remove('active'));
      circle.classList.add('active');
      applyBackground(bgPresets[circle.dataset.bg]);
    });
  });

  bgPicker.addEventListener('input', () => {
    document.querySelectorAll('.preset-circle').forEach((c) => c.classList.remove('active'));
    applyBackground(bgPicker.value);
  });

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = settingsPopover.classList.toggle('open');
    settingsBtn.classList.toggle('active', isOpen);
  });

  document.addEventListener('click', (e) => {
    if (
      settingsPopover.classList.contains('open') &&
      !settingsPopover.contains(e.target) &&
      !settingsBtn.contains(e.target)
    ) {
      settingsPopover.classList.remove('open');
      settingsBtn.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsPopover.classList.contains('open')) {
      settingsPopover.classList.remove('open');
      settingsBtn.classList.remove('active');
    }
  });

  document.querySelectorAll('#padding-controls .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#padding-controls .segment-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.documentElement.style.setProperty('--canvas-padding', btn.dataset.val);
    });
  });

  document.querySelectorAll('#win-style-controls .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#win-style-controls .segment-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const winStyle = btn.dataset.val;
      const macControls = document.getElementById('window-controls-mac');

      if (winStyle === 'mac') {
        macControls.style.display = 'flex';
      } else {
        macControls.style.display = 'none';
      }

      vscode.postMessage({
        type: 'updateWindowControls',
        data: { enabled: winStyle !== 'none' },
      });
    });
  });

  const shadowValues = {
    none: 'none',
    soft: '0 8px 30px rgba(0, 0, 0, 0.12)',
    medium: '0 20px 68px rgba(0, 0, 0, 0.55)',
  };

  document.querySelectorAll('#shadow-controls .segment-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('#shadow-controls .segment-btn')
        .forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.documentElement.style.setProperty('--window-shadow', shadowValues[btn.dataset.val]);
    });
  });

  lineNoBtn.addEventListener('click', () => {
    lineNumbersEnabled = !lineNumbersEnabled;
    lineNoBtn.classList.toggle('active', lineNumbersEnabled);
    toggleLineNumbers(lineNumbersEnabled);
  });

  function toggleLineNumbers(show) {
    if (!snippetNode) return;

    const lineContainer = snippetNode.querySelector('div');
    if (!lineContainer) return;

    const existingNumbers = snippetNode.querySelectorAll('.line-number');
    if (show && existingNumbers.length > 0) return;
    if (!show && existingNumbers.length === 0) return;

    existingNumbers.forEach((n) => n.remove());

    const allLines = Array.from(snippetNode.querySelectorAll('div > div'));
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

  let currentAttributionText = 'Created with SnippetShot';

  attributionEnabled.addEventListener('change', () => {
    bottomStatusContainer.style.display = attributionEnabled.checked ? 'block' : 'none';
    const currentState = vscode.getState() || {};
    vscode.setState({
      ...currentState,
      attributionEnabled: attributionEnabled.checked,
    });
    vscode.postMessage({
      type: 'updateSettingsFromWebview',
      data: {
        attributionEnabled: attributionEnabled.checked,
      },
    });
  });

  bottomStatusTab.addEventListener('click', () => {
    bottomStatusTab.style.display = 'none';
    bottomStatusInput.style.display = 'inline-block';
    bottomStatusInput.focus();
    bottomStatusInput.select();
  });

  bottomStatusInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      bottomStatusInput.blur();
    }
    if (e.key === 'Escape') {
      bottomStatusInput.value = currentAttributionText;
      bottomStatusInput.blur();
    }
  });

  bottomStatusInput.addEventListener('blur', () => {
    bottomStatusInput.style.display = 'none';
    bottomStatusTab.style.display = 'inline-block';
    const val = bottomStatusInput.value.trim() || 'SnippetShot';
    currentAttributionText = val;
    bottomStatusTab.innerText = val;
    const currentState = vscode.getState() || {};
    vscode.setState({
      ...currentState,
      attributionText: val,
    });
    vscode.postMessage({
      type: 'updateSettingsFromWebview',
      data: {
        attributionText: val,
      },
    });
  });

  bottomStatusInput.addEventListener('paste', (e) => {
    e.stopPropagation();
  });

  toggleBreadcrumbs.addEventListener('change', () => {
    windowTitleContainer.style.display = toggleBreadcrumbs.checked ? 'flex' : 'none';
    const currentState = vscode.getState() || {};
    vscode.setState({
      ...currentState,
      breadcrumbsVisible: toggleBreadcrumbs.checked,
    });
  });

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
    settingsPopover.classList.remove('open');
    settingsBtn.classList.remove('active');

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

    if (lastReceivedFilePath) {
      updatePathMetadata(lastReceivedFilePath, lastReceivedLanguageId);
    }
    const currentState = vscode.getState() || {};
    vscode.setState({
      ...currentState,
      innerHTML: content,
    });
    toggleLineNumbers(lineNumbersEnabled);
  });

  document.addEventListener('keydown', (e) => {
    try {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!copyBtn.disabled) copyBtn.click();
        } else {
          if (!saveBtn.disabled) saveBtn.click();
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

  function resetExportButtons() {
    copyBtn.disabled = false;
    copyBtnText.textContent = 'Copy';
    saveBtn.disabled = false;
    saveBtnText.textContent = 'Save';
  }

  function copyScreenshotToClipboard() {
    if (copyBtn.disabled) return;

    copyBtn.disabled = true;
    copyBtnText.textContent = 'Copying';

    const safetyTimeout = setTimeout(() => {
      if (copyBtn.disabled) {
        resetExportButtons();
        vscode.postMessage({
          type: 'copyError',
          message: 'Copy operation timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();

    const config = {
      backgroundColor: 'transparent',
      pixelRatio: exportPixelRatio,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      filter: (node) => {
        return (
          !node.classList ||
          (!node.classList.contains('toolbar') &&
            node.id !== 'floating-bar' &&
            node.id !== 'settings-popover')
        );
      },
    };

    const target = snippetContainerNode || snippetNode.parentElement;

    htmlToImage
      .toBlob(target, config)
      .then((blob) => {
        clearTimeout(safetyTimeout);
        if (blob) {
          if (!navigator.clipboard || !window.ClipboardItem) {
            vscode.postMessage({
              type: 'copyError',
              message: 'Clipboard API not supported. Try saving as file instead.',
            });
            restore();
            resetExportButtons();
            return;
          }
          navigator.clipboard
            .write([
              new ClipboardItem({
                'image/png': blob,
              }),
            ])
            .then(() => {
              copyBtnText.textContent = 'Copied!';
              setTimeout(() => {
                copyBtnText.textContent = 'Copy';
              }, 2000);
              vscode.postMessage({
                type: 'copySuccess',
                message: 'Screenshot copied to clipboard!',
              });
            })
            .catch((_error) => {
              vscode.postMessage({
                type: 'copyError',
                message: 'Failed to copy to clipboard. Try saving as file instead.',
              });
            })
            .finally(() => {
              restore();
              copyBtn.disabled = false;
            });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        restore();
        resetExportButtons();
        vscode.postMessage({
          type: 'copyError',
          message: `Copy failed: ${error.message || 'Unknown error'}`,
        });
      });
  }

  saveBtn.addEventListener('click', () => {
    shootAll();
  });

  copyBtn.addEventListener('click', () => {
    copyScreenshotToClipboard();
  });

  function shootAll() {
    if (saveBtn.disabled) return;

    saveBtnText.textContent = 'Saving';
    saveBtn.disabled = true;

    const safetyTimeout = setTimeout(() => {
      if (saveBtn.disabled) {
        resetExportButtons();
        vscode.postMessage({
          type: 'exportError',
          message: 'Screenshot capture timed out. Please try again.',
        });
      }
    }, 30000);

    const restore = applyExportStyles();

    const config = {
      backgroundColor: 'transparent',
      pixelRatio: exportPixelRatio,
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      filter: (node) => {
        return (
          !node.classList ||
          (!node.classList.contains('toolbar') &&
            node.id !== 'floating-bar' &&
            node.id !== 'settings-popover')
        );
      },
    };

    const target = snippetContainerNode || snippetNode.parentElement;
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
            vscode.postMessage({
              type: 'shoot',
              data: {
                serializedBlob,
              },
            });
          });
        } else {
          throw new Error('Failed to generate image blob');
        }
      })
      .catch((error) => {
        clearTimeout(safetyTimeout);
        if (target && target.classList) target.classList.remove('capture-flash');
        resetExportButtons();

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
      applyBackground(data.bgColor);
    }
  }

  window.addEventListener('message', (e) => {
    if (!e || !e.data) return;

    const {
      type,
      innerHTML,
      shadow,
      attributionEnabled: attrEnabled,
      windowControlsEnabled,
      attributionText: attrText,
      ligature,
    } = e.data;

    if (type === 'init') {
      applyInitialSnippet();
      if (e.data.filePath) {
        updatePathMetadata(e.data.filePath, e.data.languageId || 'plaintext');
      }
      const currentState = vscode.getState() || {};
      vscode.setState({
        ...currentState,
        innerHTML: snippetNode.innerHTML,
      });
      toggleLineNumbers(lineNumbersEnabled);
      updateStateUI(e.data);
    } else if (type === 'update') {
      lastReceivedFilePath = e.data.filePath;
      lastReceivedLanguageId = e.data.languageId;
      document.execCommand('paste');
    } else if (type === 'restore') {
      if (innerHTML) {
        snippetNode.innerHTML = innerHTML;
      }
      if (e.data.filePath) {
        updatePathMetadata(e.data.filePath, e.data.languageId || 'plaintext');
      }
      toggleLineNumbers(lineNumbersEnabled);
      updateStateUI(e.data);
    } else if (type === 'restoreBgColor') {
      updateStateUI(e.data);
    } else if (type === 'updateSettings') {
      if (shadow) {
        document.documentElement.style.setProperty('--window-shadow', shadow);
        let matchingKey = 'medium';
        for (const [key, value] of Object.entries(shadowValues)) {
          if (value === shadow) {
            matchingKey = key;
            break;
          }
        }
        document.querySelectorAll('#shadow-controls .segment-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.val === matchingKey);
        });
      }

      if (attrEnabled !== undefined) {
        attributionEnabled.checked = attrEnabled;
        bottomStatusContainer.style.display = attrEnabled ? 'block' : 'none';
      }

      if (windowControlsEnabled !== undefined) {
        const styleName = windowControlsEnabled ? 'mac' : 'none';
        document.querySelectorAll('#win-style-controls .segment-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.dataset.val === styleName);
        });

        const macControls = document.getElementById('window-controls-mac');
        if (windowControlsEnabled) {
          macControls.style.display = 'flex';
        } else {
          macControls.style.display = 'none';
        }
      }

      if (attrText) {
        currentAttributionText = attrText;
        bottomStatusTab.innerText = attrText;
        bottomStatusInput.value = attrText;
      }

      if (snippetNode) {
        if (ligature) {
          snippetNode.style.fontVariantLigatures = 'normal';
        } else {
          snippetNode.style.fontVariantLigatures = 'none';
        }
      }
    } else if (type === 'save') {
      shootAll();
    } else if (type === 'saveSuccess') {
      saveBtnText.textContent = 'Saved!';
      saveBtn.disabled = false;
      if (saveLabelTimer) {
        clearTimeout(saveLabelTimer);
      }
      saveLabelTimer = setTimeout(() => {
        saveBtnText.textContent = 'Save';
      }, 2000);
    } else if (type === 'saveError') {
      resetExportButtons();
    }
  });
})();
