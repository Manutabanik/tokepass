import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampWizardStep,
  editWorkspaceStepKey,
  isLastVisibleWizardStep,
  nextWizardStep,
  parseEditWorkspaceStep,
  prevWizardStep,
  visibleWizardSteps,
  WIZARD_STEP_AGENDA,
  WIZARD_STEP_CONFIG,
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
} from "./wizard-steps"

const none = { hasSeatingPlan: false, hasSchedule: false }
const mapOnly = { hasSeatingPlan: true, hasSchedule: false }
const agendaOnly = { hasSeatingPlan: false, hasSchedule: true }
const both = { hasSeatingPlan: true, hasSchedule: true }

describe("wizard-steps", () => {
  it("skips the map step when the event has no seating plan", () => {
    assert.equal(nextWizardStep(WIZARD_STEP_IDENTITY, none), WIZARD_STEP_TICKETS)
    assert.equal(
      prevWizardStep(WIZARD_STEP_TICKETS, none),
      WIZARD_STEP_IDENTITY,
    )
    assert.equal(clampWizardStep(WIZARD_STEP_MAP, none), WIZARD_STEP_IDENTITY)
  })

  it("skips the agenda step when the event has no schedule", () => {
    assert.deepEqual(visibleWizardSteps(none), [
      WIZARD_STEP_IDENTITY,
      WIZARD_STEP_TICKETS,
      WIZARD_STEP_CONFIG,
    ])
    assert.equal(
      nextWizardStep(WIZARD_STEP_IDENTITY, none),
      WIZARD_STEP_TICKETS,
    )
    assert.equal(
      clampWizardStep(WIZARD_STEP_AGENDA, none),
      WIZARD_STEP_IDENTITY,
    )
  })

  it("inserts agenda between identity and tickets when only the schedule is on", () => {
    assert.equal(
      nextWizardStep(WIZARD_STEP_IDENTITY, agendaOnly),
      WIZARD_STEP_AGENDA,
    )
    assert.equal(
      nextWizardStep(WIZARD_STEP_AGENDA, agendaOnly),
      WIZARD_STEP_TICKETS,
    )
    assert.equal(
      prevWizardStep(WIZARD_STEP_TICKETS, agendaOnly),
      WIZARD_STEP_AGENDA,
    )
    assert.equal(
      prevWizardStep(WIZARD_STEP_AGENDA, agendaOnly),
      WIZARD_STEP_IDENTITY,
    )
  })

  it("keeps the four-step path when only the seating plan is enabled", () => {
    assert.equal(nextWizardStep(WIZARD_STEP_IDENTITY, mapOnly), WIZARD_STEP_MAP)
    assert.equal(nextWizardStep(WIZARD_STEP_MAP, mapOnly), WIZARD_STEP_TICKETS)
    assert.equal(prevWizardStep(WIZARD_STEP_TICKETS, mapOnly), WIZARD_STEP_MAP)
    assert.equal(nextWizardStep(WIZARD_STEP_TICKETS, mapOnly), WIZARD_STEP_CONFIG)
  })

  it("walks identity → agenda → map → tickets when both flags are on", () => {
    assert.equal(nextWizardStep(WIZARD_STEP_IDENTITY, both), WIZARD_STEP_AGENDA)
    assert.equal(nextWizardStep(WIZARD_STEP_AGENDA, both), WIZARD_STEP_MAP)
    assert.equal(nextWizardStep(WIZARD_STEP_MAP, both), WIZARD_STEP_TICKETS)
    assert.equal(prevWizardStep(WIZARD_STEP_MAP, both), WIZARD_STEP_AGENDA)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_CONFIG, both), true)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_TICKETS, both), false)
  })

  it("keeps the three edit-workspace tabs even without a seating plan", () => {
    const workspace = { ...none, editWorkspace: true }
    assert.deepEqual(visibleWizardSteps(workspace), [
      WIZARD_STEP_IDENTITY,
      WIZARD_STEP_MAP,
      WIZARD_STEP_TICKETS,
    ])
    assert.equal(clampWizardStep(WIZARD_STEP_MAP, workspace), WIZARD_STEP_MAP)
    assert.equal(
      clampWizardStep(WIZARD_STEP_CONFIG, workspace),
      WIZARD_STEP_TICKETS,
    )
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_TICKETS, workspace), true)
  })

  it("parses edit workspace query keys", () => {
    assert.equal(parseEditWorkspaceStep("info"), WIZARD_STEP_IDENTITY)
    assert.equal(parseEditWorkspaceStep("map"), WIZARD_STEP_MAP)
    assert.equal(parseEditWorkspaceStep("pricing"), WIZARD_STEP_TICKETS)
    assert.equal(parseEditWorkspaceStep("unknown"), WIZARD_STEP_IDENTITY)
    assert.equal(editWorkspaceStepKey(WIZARD_STEP_MAP), "map")
  })
})
