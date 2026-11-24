package main

import (
	"net/http"
	"sync"
	"testing"
)

// Run with -race: this fails through the race detector, not an assertion.

func TestListRuns_WhileARetryUnblocksTheRun_HasNoDataRace(t *testing.T) {
	f := newRetryFixture(t)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { // an operator retrying a blocked run, over and over
		defer wg.Done()
		for i := 0; i < 100; i++ {
			f.fail("warm_reagent_plate", true)
			f.run.Mu.Lock()
			f.run.Status = "blocked"
			f.run.Mu.Unlock()
			f.run.ClaimRetry("warm_reagent_plate")
		}
	}()
	for i := 0; i < 100; i++ {
		if res, err := http.Get(f.ts.URL + "/runs"); err == nil {
			res.Body.Close()
		}
	}
	wg.Wait()
}
