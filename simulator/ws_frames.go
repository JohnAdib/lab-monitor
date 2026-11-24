package main

import (
	"context"
	"encoding/json"

	"github.com/coder/websocket"
)

// gapFrame tells a resuming client that events between From and Earliest were
// evicted before it came back. It is the only non-event frame on the wire.
type gapFrame struct {
	Type     string `json:"type"`     // always "gap"
	From     uint64 `json:"from"`     // the resume_from the client asked for
	Earliest uint64 `json:"earliest"` // the oldest seq still held; the replay starts here
}

func writeEvent(ctx context.Context, conn *websocket.Conn, e Event) error {
	return writeFrame(ctx, conn, e)
}

// writeFrame sends any JSON frame. (writeJSON is the HTTP helper in http.go.)
func writeFrame(ctx context.Context, conn *websocket.Conn, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, b)
}
