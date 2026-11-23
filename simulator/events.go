package main

import "time"

// Event is everything the browser learns about a run.
//
// Seq is the stream's sequence number. It is 0 in the starter because nothing
// assigns it yet -- see stream.go.
type Event struct {
	Seq      uint64     `json:"seq"`
	RunID    string     `json:"run_id"`
	Type     string     `json:"type"`
	StepID   string     `json:"step_id,omitempty"`
	Attempt  int        `json:"attempt,omitempty"`
	DeviceID string     `json:"device_id,omitempty"`
	At       time.Time  `json:"at"`
	Error    *StepError `json:"error,omitempty"`
}

// StepError is what an instrument reports when a step goes wrong.
//
// Code, Instrument, Detail and Retryable are the same for every instrument.
// Context is not: each one reports whatever it happens to know, so the keys
// differ by device and by fault. Nothing enumerates them.
type StepError struct {
	Code       string         `json:"code"`
	Instrument string         `json:"instrument"`
	Detail     string         `json:"detail"`
	Retryable  bool           `json:"retryable"`
	Context    map[string]any `json:"context,omitempty"`
}

const (
	EventStepDispatched = "step.dispatched"
	EventStepRefused    = "step.refused"
	EventStepStarted    = "step.started"
	EventStepFinished   = "step.finished"
	EventStepFailed     = "step.failed"
	EventRunBlocked     = "run.blocked"
	EventRunCompleted   = "run.completed"
)
