package main

import (
	"context"
	"math/rand"
	"time"

	"github.com/coder/websocket"
)

// reorderMaxDelay is how long REORDER_PCT may hold an event waiting for the
// next one to swap with.
const reorderMaxDelay = 300 * time.Millisecond

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
