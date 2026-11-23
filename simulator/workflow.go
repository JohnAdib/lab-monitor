package main

import "time"

// The default workflow. Same shape as the Core Systems exercise:
//
//	fill_sample_plate --+--> incubate_samples ---------------------+
//	                    |                                          |
//	                    +--> fill_reagent_plate --> warm_reagent ---+--> combine --> read_plate
//	                    |                                          |
//	                    +--> fill_buffer_plate ---------------------+
//
// Three steps share the liquid handler and two share the incubator, so the
// devices are contended and the run produces refusals without any help.
type StepDef struct {
	ID        string
	DeviceID  string
	Duration  time.Duration
	DependsOn []string
}

var defaultWorkflow = []StepDef{
	{ID: "fill_sample_plate", DeviceID: "liquid-handler-1", Duration: 2 * time.Second},
	{ID: "incubate_samples", DeviceID: "incubator-1", Duration: 4 * time.Second,
		DependsOn: []string{"fill_sample_plate"}},
	{ID: "fill_reagent_plate", DeviceID: "liquid-handler-1", Duration: 2 * time.Second,
		DependsOn: []string{"fill_sample_plate"}},
	{ID: "fill_buffer_plate", DeviceID: "liquid-handler-1", Duration: 2 * time.Second,
		DependsOn: []string{"fill_sample_plate"}},
	{ID: "warm_reagent_plate", DeviceID: "incubator-1", Duration: 3 * time.Second,
		DependsOn: []string{"fill_reagent_plate"}},
	{ID: "combine", DeviceID: "liquid-handler-1", Duration: 2 * time.Second,
		DependsOn: []string{"incubate_samples", "warm_reagent_plate", "fill_buffer_plate"}},
	{ID: "read_plate", DeviceID: "plate-reader-1", Duration: 2 * time.Second,
		DependsOn: []string{"combine"}},
}

var devices = []string{"liquid-handler-1", "incubator-1", "plate-reader-1"}

// faultFor is what a device reports when FAIL_STEP makes it go wrong. The
// context each one carries is whatever that instrument knows about itself.
func faultFor(deviceID, stepID string) *StepError {
	switch deviceID {
	case "incubator-1":
		return &StepError{
			Code: "SETPOINT_NOT_REACHED", Instrument: deviceID, Retryable: true,
			Detail: "chamber did not reach 37.0C within tolerance",
			Context: map[string]any{
				"target_c": 37.0, "actual_c": 31.2, "tolerance_c": 0.5,
				"elapsed_s": 180, "labware": "PLT-00421", "door_cycles": 2,
			},
		}
	case "liquid-handler-1":
		return &StepError{
			Code: "TIP_PICKUP_FAILED", Instrument: deviceID, Retryable: true,
			Detail: "no tip detected on channel 4 after pickup",
			Context: map[string]any{
				"channel": 4, "tip_box": "TIP-07", "wells_remaining": 12,
				"volume_ul": 45.0, "labware": "PLT-00421",
			},
		}
	case "plate-reader-1":
		return &StepError{
			Code: "CALIBRATION_EXPIRED", Instrument: deviceID, Retryable: false,
			Detail: "last calibration was 41 days ago; limit is 30",
			Context: map[string]any{
				"last_calibrated": "2026-07-22", "max_age_days": 30,
				"filter_set": "FITC/TRITC", "service_ticket": "SVC-3312",
			},
		}
	}
	return &StepError{
		Code: "UNKNOWN", Instrument: deviceID, Detail: "step " + stepID + " failed",
		Retryable: true,
	}
}
