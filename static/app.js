(function () {
  let ws = null;
  let term = null;
  let fitAddon = null;
  let reconnectTimeout = null;

  // History tracking for the bottom textbox
  const commandHistory = [];
  let historyIndex = -1;

  // DOM Elements
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const terminalContainer = document.getElementById('terminal');
  const commandForm = document.getElementById('commandForm');
  const cmdInput = document.getElementById('cmdInput');
  const btnAgy = document.getElementById('btnAgy');
  const btnCtrlC = document.getElementById('btnCtrlC');
  const btnCtrlD = document.getElementById('btnCtrlD');
  const btnClear = document.getElementById('btnClear');
  const btnReconnect = document.getElementById('btnReconnect');

  function initTerminal() {
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: '#0b0c10',
        foreground: '#d1d5db',
        cursor: '#60a5fa',
        cursorAccent: '#0b0c10',
        selectionBackground: '#374151',
        black: '#1f2937',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#f3f4f6',
        brightBlack: '#4b5563',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalContainer);

    setTimeout(() => {
      fitAddon.fit();
      sendResize();
    }, 100);

    window.addEventListener('resize', () => {
      if (fitAddon) {
        fitAddon.fit();
        sendResize();
      }
    });

    // Handle interactive terminal keystrokes
    term.onData((data) => {
      sendRawInput(data);
    });
  }

  function setStatus(connected, text) {
    if (connected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = text || 'Connected';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = text || 'Disconnected';
    }
  }

  function sendRawInput(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: data }));
    }
  }

  function sendResize() {
    if (ws && ws.readyState === WebSocket.OPEN && term) {
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      }));
    }
  }

  function connectWebSocket() {
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    setStatus(false, 'Connecting...');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setStatus(true, 'Connected');
      sendResize();
      term.focus();
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder('utf-8').decode(event.data);
        term.write(text);
      } else if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output' && msg.data) {
            term.write(msg.data);
          }
        } catch (e) {
          term.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      setStatus(false, 'Disconnected');
    };

    ws.onerror = (err) => {
      setStatus(false, 'Error');
    };
  }

  // Handle command textbox submission
  commandForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const cmd = cmdInput.value.trim();
    if (!cmd) return;

    // Save to history
    commandHistory.push(cmd);
    historyIndex = commandHistory.length;

    // Send command with newline to shell
    sendRawInput(cmd + '\n');
    cmdInput.value = '';
  });

  // History navigation with arrow keys inside textbox
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (commandHistory.length > 0 && historyIndex > 0) {
        historyIndex--;
        cmdInput.value = commandHistory[historyIndex];
        e.preventDefault();
      }
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        cmdInput.value = commandHistory[historyIndex];
        e.preventDefault();
      } else {
        historyIndex = commandHistory.length;
        cmdInput.value = '';
      }
    }
  });

  // Action buttons
  btnAgy.addEventListener('click', () => {
    sendRawInput('agy\n');
    term.focus();
  });

  btnCtrlC.addEventListener('click', () => {
    sendRawInput('\x03');
    term.focus();
  });

  btnCtrlD.addEventListener('click', () => {
    sendRawInput('\x04');
    term.focus();
  });

  btnClear.addEventListener('click', () => {
    term.clear();
    sendRawInput('clear\n');
    term.focus();
  });

  btnReconnect.addEventListener('click', () => {
    connectWebSocket();
  });

  // Initialize terminal and connect
  initTerminal();
  connectWebSocket();
})();
