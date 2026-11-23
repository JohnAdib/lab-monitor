package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// retryFixture is a server with one created run whose steps the test can set.
type retryFixture struct {
	t   *testing.T
	ts  *httptest.Server
	run *Run
}

func newRetryFixture(t *testing.T) *retryFixture {
	srv := NewServer(Config{ReplayBufferSize: 64})
	ts := httptest.NewServer(srv.Routes())
	t.Cleanup(ts.Close)
	res, err := http.Post(ts.URL+"/runs", "application/json", nil)
	if err != nil {
		t.Fatal(err)
	}
	var created struct{ ID string }
	_ = json.NewDecoder(res.Body).Decode(&created)
	res.Body.Close()
	return &retryFixture{t: t, ts: ts, run: srv.run(created.ID)}
}

func (f *retryFixture) fail(stepID string, retryable bool) {
	f.run.Mu.Lock()
	defer f.run.Mu.Unlock()
	s := f.run.Steps[stepID]
	s.Status, s.Attempt = StatusFailed, 1
	s.Error = &StepError{Code: "X", Instrument: s.DeviceID, Detail: "broke", Retryable: retryable}
}

func (f *retryFixture) retry(runID, stepID string) (int, retryResponse) {
	f.t.Helper()
	res, err := http.Post(f.ts.URL+"/runs/"+runID+"/steps/"+stepID+"/retry", "application/json", nil)
	if err != nil {
		f.t.Fatal(err)
	}
	defer res.Body.Close()
	var body retryResponse
	_ = json.NewDecoder(res.Body).Decode(&body)
	return res.StatusCode, body
}

func TestRetry_FailedRetryableStep_Returns202WithTheAttemptItWillRun(t *testing.T) {
	f := newRetryFixture(t)
	f.fail("warm_reagent_plate", true)
	code, body := f.retry(f.run.ID, "warm_reagent_plate")
	if code != http.StatusAccepted || body.Attempt != 2 || body.Status != StatusPending {
		t.Fatalf("got %d %+v, want 202 attempt 2 status pending", code, body)
	}
}

func TestRetry_SecondIdenticalCall_Returns409ShowingTheRetryIsAlreadyQueued(t *testing.T) {
	f := newRetryFixture(t)
	f.fail("warm_reagent_plate", true)
	f.retry(f.run.ID, "warm_reagent_plate")
	code, body := f.retry(f.run.ID, "warm_reagent_plate")
	if code != http.StatusConflict || body.Error != "not_failed" || body.Status != StatusPending {
		t.Fatalf("got %d %+v, want 409 not_failed status pending", code, body)
	}
}

func TestRetry_UnretryableFailure_Returns422WithTheFaultAndLeavesStepFailed(t *testing.T) {
	f := newRetryFixture(t)
	f.fail("read_plate", false)
	code, body := f.retry(f.run.ID, "read_plate")
	if code != http.StatusUnprocessableEntity || body.Error != "not_retryable" || body.Fault == nil {
		t.Fatalf("got %d %+v, want 422 not_retryable with fault", code, body)
	}
	if s, _ := f.run.Step("read_plate"); s.Status != StatusFailed {
		t.Fatalf("step is %q after a refused retry, want failed", s.Status)
	}
}

func TestRetry_UnknownStep_Returns404(t *testing.T) {
	f := newRetryFixture(t)
	if code, body := f.retry(f.run.ID, "no_such_step"); code != http.StatusNotFound || body.Error != "unknown_step" {
		t.Fatalf("got %d %+v, want 404 unknown_step", code, body)
	}
}

func TestRetry_UnknownRun_Returns404(t *testing.T) {
	f := newRetryFixture(t)
	if code, _ := f.retry("r-404", "warm_reagent_plate"); code != http.StatusNotFound {
		t.Fatalf("got %d, want 404", code)
	}
}
