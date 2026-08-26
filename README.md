# Antigravity Web Remote (`agy-remote`)

A minimal, zero-dependency web interface and Go backend that provides remote terminal access to your machine over WebSockets. Perfect for running `agy` (Antigravity CLI), managing files, or running remote terminal sessions directly from your browser.

## Features

- **Real PTY terminal**: Uses `github.com/creack/pty` on Linux/macOS for full ANSI color codes, raw mode, and interactive shell handling.
- **Embedded Frontend**: All web assets (`index.html`, `style.css`, `app.js`, `xterm.js`) are embedded into the Go binary (`go:embed`). No external assets or runtime dependencies needed.
- **Interactive Terminal & Command Bar**:
  - Full **xterm.js** terminal emulator (mouse wheel scroll, copy/paste, raw keyboard shortcuts).
  - Quick-command input textbox with history navigation (Up / Down arrows).
  - Quick-action buttons (e.g. `Launch agy`, `Ctrl+C`, `Ctrl+D`, `Clear`, `Reconnect`).
- **Dynamic Terminal Resize**: Synchronizes row/column dimensions automatically on browser window resize.

## Getting Started

### 1. Run directly with Go:
```bash
go run . -port 8080
```

### 2. Or build and run binary:
```bash
go build -o agy-remote .
./agy-remote -port 8080
```

### 3. Open in Browser:
Visit `http://localhost:8080` (or `http://<your-machine-ip>:8080`).

### Flags:
- `-port`: Port to listen on (default: `8080`)
- `-host`: Host interface to bind to (default: `0.0.0.0`)
- `-shell`: Shell binary to execute (default: `$SHELL` or `/bin/bash`)
