package main

import (
	"sync"
	"testing"
	"time"
)

func failedRun(retryable bool) *Run {
	r := NewRun("r-1", defaultWorkflow, NewStream(8), "")
	s := r.Steps["warm_reagent_plate"]
	start, end := time.Now(), time.Now()
	s.Status, s.Attempt = StatusFailed, 1
	s.StartedAt, s.EndedAt = &start, &end // a real failure has both, so clearing them is tested
	s.Error = &StepError{Code: "X", Retryable: retryable}
	return r
}

func TestClaimRetry_ConcurrentCallers_ExactlyOneClaims(t *testing.T) {
	r := failedRun(true)
	var wg sync.WaitGroup
	var mu sync.Mutex
	claimed := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if outcome, _ := r.ClaimRetry("warm_reagent_plate"); outcome == retryClaimed {
				mu.Lock()
				claimed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if claimed != 1 {
		t.Fatalf("%d callers claimed one failure, want exactly 1", claimed)
	}
}

func TestClaimRetry_BlockedRun_IsRunningAgainOnceClaimed(t *testing.T) {
	r := failedRun(true)
	r.Status = "blocked"
	r.ClaimRetry("warm_reagent_plate")
	if r.Status != "running" {
		t.Fatalf("run status is %q after a claimed retry, want running", r.Status)
	}
}

func TestClaimRetry_Claimed_ClearsTheFailureFromTheStep(t *testing.T) {
	r := failedRun(true)
	_, s := r.ClaimRetry("warm_reagent_plate")
	if s.Status != StatusPending || s.Error != nil || s.EndedAt != nil {
		t.Fatalf("claimed step = %+v, want pending with no error or end", s)
	}
}

func TestClaimRetry_Unretryable_ReturnsTheFaultAndChangesNothing(t *testing.T) {
	r := failedRun(false)
	outcome, s := r.ClaimRetry("warm_reagent_plate")
	if outcome != retryNotRetryable || s.Error == nil || r.Steps["warm_reagent_plate"].Status != StatusFailed {
		t.Fatalf("outcome %v step %+v, want not retryable and still failed", outcome, s)
	}
}
