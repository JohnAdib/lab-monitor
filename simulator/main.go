package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
)

// Config is set from the environment. Every chaos knob is off by default.
//
//	REPLAY_BUFFER_SIZE  how many events the stream can replay  (default 64)
//	FAIL_STEP           step that fails once, on its first attempt
//	REORDER_PCT         events delivered out of order
//	DUPLICATE_PCT       events delivered twice
//	SOCKET_KILL_MS      server drops each socket after this long
//	SOCKET_REJECT_MS    after a drop, the server refuses to reconnect for this
//	                    long -- long enough for the buffer to move past you
type Config struct {
	Port             string
	ReplayBufferSize int
	FailStep         string
	ReorderPct       int
	DuplicatePct     int
	SocketKillMS     int
	SocketRejectMS   int
}

func main() {
	cfg := Config{
		Port:             env("PORT", "5002"),
		ReplayBufferSize: envInt("REPLAY_BUFFER_SIZE", 64),
		FailStep:         env("FAIL_STEP", ""),
		ReorderPct:       envInt("REORDER_PCT", 0),
		DuplicatePct:     envInt("DUPLICATE_PCT", 0),
		SocketKillMS:     envInt("SOCKET_KILL_MS", 0),
		SocketRejectMS:   envInt("SOCKET_REJECT_MS", 0),
	}
	srv := NewServer(cfg)
	log.Printf("simulator listening on :%s (buffer=%d fail=%q)", cfg.Port, cfg.ReplayBufferSize, cfg.FailStep)
	log.Fatal(http.ListenAndServe(":"+cfg.Port, cors(srv.Routes())))
}

func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
