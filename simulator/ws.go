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
// chaos knobs. The one hole in it is marked TASK 4 below.
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
		// -------------------------------------------------------------------
		// TASK 4. The client asked to resume from a position the buffer no
		// longer holds, so some of the run happened and nobody can replay it.
		//
		// Sending nothing here is the same as pretending it did not happen:
		// the socket simply goes live, the client carries on from the next
		// event, and a failure and its retry are missing from the timeline
		// with nothing to say so. It looks correct and it is not.
		//
		// Decide what the client is told, and make sure the client can tell
		// this apart from a clean resume. The shape is yours.
		// -------------------------------------------------------------------
		_ = gap
	}

	for _, e := range backlog {
		if err := writeEvent(ctx, conn, e); err != nil {
			return
		}
	}
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
			if err := s.writeWithChaos(ctx, conn, e); err != nil {
				return
			}
		}
	}
}

// writeWithChaos applies DUPLICATE_PCT and REORDER_PCT on the wire, after
// sequence numbers have been assigned. It models a lossy network, not a bug in
// anyone's code, which is why it lives here and not in stream.go.
func (s *Server) writeWithChaos(ctx context.Context, conn *websocket.Conn, e Event) error {
	if s.cfg.ReorderPct > 0 && rand.Intn(100) < s.cfg.ReorderPct {
		s.held = append(s.held, e)
		if len(s.held) < 2 {
			return nil
		}
		held := s.held
		s.held = nil
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

func writeEvent(ctx context.Context, conn *websocket.Conn, e Event) error {
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, b)
}
