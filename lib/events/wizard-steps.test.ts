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

describe("wizard-steps", () => {
  it("keeps a fixed 3-step studio path", () => {
    assert.deepEqual(visibleWizardSteps(none), [
      WIZARD_STEP_IDENTITY,
      WIZARD_STEP_MAP,
      WIZARD_STEP_TICKETS,
    ])
    assert.equal(nextWizardStep(WIZARD_STEP_IDENTITY, none), WIZARD_STEP_MAP)
    assert.equal(nextWizardStep(WIZARD_STEP_MAP, none), WIZARD_STEP_TICKETS)
    assert.equal(prevWizardStep(WIZARD_STEP_TICKETS, none), WIZARD_STEP_MAP)
    assert.equal(prevWizardStep(WIZARD_STEP_MAP, none), WIZARD_STEP_IDENTITY)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_TICKETS, none), true)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_MAP, none), false)
  })

  it("folds legacy agenda and config drafts into the studio steps", () => {
    assert.equal(clampWizardStep(WIZARD_STEP_AGENDA, none), WIZARD_STEP_MAP)
    assert.equal(clampWizardStep(WIZARD_STEP_CONFIG, none), WIZARD_STEP_TICKETS)
  })

  it("uses the same 3 steps in the edit workspace", () => {
    const workspace = { ...mapOnly, editWorkspace: true }
    assert.deepEqual(visibleWizardSteps(workspace), [
      WIZARD_STEP_IDENTITY,
      WIZARD_STEP_MAP,
      WIZARD_STEP_TICKETS,
    ])
    assert.equal(
      nextWizardStep(WIZARD_STEP_IDENTITY, workspace),
      WIZARD_STEP_MAP,
    )
    assert.equal(nextWizardStep(WIZARD_STEP_MAP, workspace), WIZARD_STEP_TICKETS)
    assert.equal(prevWizardStep(WIZARD_STEP_TICKETS, workspace), WIZARD_STEP_MAP)
  })

  it("parses edit workspace query keys", () => {
    assert.equal(parseEditWorkspaceStep("info"), WIZARD_STEP_IDENTITY)
    assert.equal(parseEditWorkspaceStep("map"), WIZARD_STEP_MAP)
    assert.equal(parseEditWorkspaceStep("place"), WIZARD_STEP_MAP)
    assert.equal(parseEditWorkspaceStep("pricing"), WIZARD_STEP_TICKETS)
    assert.equal(parseEditWorkspaceStep("unknown"), WIZARD_STEP_IDENTITY)
    assert.equal(editWorkspaceStepKey(WIZARD_STEP_MAP), "map")
  })
})
