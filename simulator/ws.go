package main

import (
	"context"
	"encoding/json"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/coder/websocket"
)

// serveWS is provided: connection lifecycle, query parsing, and the wire
// chaos knobs. A resume the buffer cannot serve starts with a gapFrame.
//
//	GET /ws?run_id=r-1&resume_from=41
//
// resume_from is the last sequence number the client already has. It is 0 on a
// first connection.
func (s *Server) serveWS(w http.ResponseWriter, req *http.Request) {
	stream := s.streamFor(req.URL.Query().Get("run_id"))
	if stream == nil {
		http.Error(w, "no such run", http.StatusNotFound)
		return
	}

	// SOCKET_REJECT_MS: stay unreachable for a while after dropping someone,
	// so the run genuinely moves on without them.
	s.mu.Lock()
	closed := time.Now().Before(s.openFrom)
	s.mu.Unlock()
	if closed {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}

	conn, err := websocket.Accept(w, req, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	defer conn.CloseNow()

	resumeFrom, _ := strconv.ParseUint(req.URL.Query().Get("resume_from"), 10, 64)
	backlog, live, gap, cancel := stream.Subscribe(resumeFrom)
	defer cancel()

	ctx := req.Context()
	if s.cfg.SocketKillMS > 0 {
		var stop context.CancelFunc
		ctx, stop = context.WithTimeout(ctx, time.Duration(s.cfg.SocketKillMS)*time.Millisecond)
		defer stop()
	}

	if gap {
		// Some of the run happened and nobody can replay it. Say so before the
		// replay, so the client never mistakes this for a clean resume. When
		// there is a gap the backlog is everything held, so it is never empty.
		notice := gapFrame{Type: "gap", From: resumeFrom, Earliest: backlog[0].Seq}
		if err := writeFrame(ctx, conn, notice); err != nil {
			return
		}
	}

	for _, e := range backlog {
		if err := writeEvent(ctx, conn, e); err != nil {
			return
		}
	}
	var held []Event // per socket: the reorder queue must not mix viewers
	for {
		select {
		case <-ctx.Done():
			if s.cfg.SocketRejectMS > 0 {
				s.mu.Lock()
				s.openFrom = time.Now().Add(time.Duration(s.cfg.SocketRejectMS) * time.Millisecond)
				s.mu.Unlock()
			}
			_ = conn.Close(websocket.StatusGoingAway, "closing")
			return
		case e, ok := <-live:
			if !ok {
				return
			}
			if err := s.writeWithChaos(ctx, conn, e, &held); err != nil {
				return
			}
		}
	}
}

// writeWithChaos applies DUPLICATE_PCT and REORDER_PCT on the wire, after
// sequence numbers have been assigned. It models a lossy network, not a bug in
// anyone's code, which is why it lives here and not in stream.go. queue holds
// this socket's reordered events.
func (s *Server) writeWithChaos(ctx context.Context, conn *websocket.Conn, e Event, queue *[]Event) error {
	if s.cfg.ReorderPct > 0 && rand.Intn(100) < s.cfg.ReorderPct {
		*queue = append(*queue, e)
		if len(*queue) < 2 {
			return nil
		}
		held := *queue
		*queue = nil
		for i := len(held) - 1; i >= 0; i-- { // release backwards
			if err := writeEvent(ctx, conn, held[i]); err != nil {
				return err
			}
		}
		return nil
	}
	if err := writeEvent(ctx, conn, e); err != nil {
		return err
	}
	if s.cfg.DuplicatePct > 0 && rand.Intn(100) < s.cfg.DuplicatePct {
		return writeEvent(ctx, conn, e)
	}
	return nil
}

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
