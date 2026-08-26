package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

//go:embed static/*
var staticFS embed.FS

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSMessage struct {
	Type string `json:"type"` // "input", "resize", "ping"
	Data string `json:"data,omitempty"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

func main() {
	port := flag.Int("port", 8080, "Port to listen on")
	host := flag.String("host", "0.0.0.0", "Host interface to bind to")
	shellCmd := flag.String("shell", "", "Shell to execute (defaults to $SHELL or /bin/bash)")
	flag.Parse()

	if *shellCmd == "" {
		*shellCmd = os.Getenv("SHELL")
		if *shellCmd == "" {
			*shellCmd = "/bin/bash"
		}
	}

	// Serve static files from embedded FS
	subFS, err := fs.Sub(staticFS, "static")
	if err != nil {
		log.Fatalf("Failed to initialize static sub-filesystem: %v", err)
	}

	http.Handle("/", http.FileServer(http.FS(subFS)))
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWS(w, r, *shellCmd)
	})

	addr := fmt.Sprintf("%s:%d", *host, *port)
	fmt.Printf("🚀 Antigravity Shell Remote running at http://%s\n", addr)
	fmt.Printf("Default shell: %s\n", *shellCmd)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleWS(w http.ResponseWriter, r *http.Request, shell string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)

	// Start command in a pty
	ptyFile, err := pty.Start(cmd)
	if err != nil {
		log.Printf("Failed to start pty: %v", err)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("Failed to spawn shell: %v\r\n", err)))
		return
	}
	defer func() {
		_ = ptyFile.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	}()

	// Mutex for writing to websocket safely across goroutines
	var wsMutex sync.Mutex
	writeWS := func(messageType int, data []byte) error {
		wsMutex.Lock()
		defer wsMutex.Unlock()
		return conn.WriteMessage(messageType, data)
	}

	// Read from PTY -> Write to WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptyFile.Read(buf)
			if n > 0 {
				if wErr := writeWS(websocket.BinaryMessage, buf[:n]); wErr != nil {
					break
				}
			}
			if err != nil {
				if err != io.EOF {
					log.Printf("PTY read error: %v", err)
				}
				break
			}
		}
		_ = conn.Close()
	}()

	// Read from WebSocket -> Write to PTY
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		if messageType == websocket.BinaryMessage {
			_, _ = ptyFile.Write(payload)
			continue
		}

		if messageType == websocket.TextMessage {
			var msg WSMessage
			if err := json.Unmarshal(payload, &msg); err == nil {
				switch msg.Type {
				case "input":
					_, _ = ptyFile.Write([]byte(msg.Data))
				case "resize":
					if msg.Cols > 0 && msg.Rows > 0 {
						_ = pty.Setsize(ptyFile, &pty.Winsize{
							Rows: msg.Rows,
							Cols: msg.Cols,
						})
					}
				case "ping":
					_ = writeWS(websocket.TextMessage, []byte(`{"type":"pong"}`))
				}
			} else {
				// Fallback: Treat plain text payload as raw input
				_, _ = ptyFile.Write(payload)
			}
		}
	}
}
