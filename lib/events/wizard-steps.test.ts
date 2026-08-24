import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  clampWizardStep,
  editWorkspaceStepKey,
  isLastVisibleWizardStep,
  nextWizardStep,
  parseEditWorkspaceStep,
  prevWizardStep,
  usesWizardUpdateActions,
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
      WIZARD_STEP_TICKETS,
      WIZARD_STEP_CONFIG,
    ])
    assert.equal(nextWizardStep(WIZARD_STEP_IDENTITY, none), WIZARD_STEP_TICKETS)
    assert.equal(nextWizardStep(WIZARD_STEP_TICKETS, none), WIZARD_STEP_CONFIG)
    assert.equal(prevWizardStep(WIZARD_STEP_CONFIG, none), WIZARD_STEP_TICKETS)
    assert.equal(prevWizardStep(WIZARD_STEP_TICKETS, none), WIZARD_STEP_IDENTITY)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_CONFIG, none), true)
    assert.equal(isLastVisibleWizardStep(WIZARD_STEP_TICKETS, none), false)
  })

  it("folds legacy agenda and map drafts into identity", () => {
    assert.equal(clampWizardStep(WIZARD_STEP_AGENDA, none), WIZARD_STEP_IDENTITY)
    assert.equal(clampWizardStep(WIZARD_STEP_MAP, none), WIZARD_STEP_IDENTITY)
    assert.equal(clampWizardStep(WIZARD_STEP_CONFIG, none), WIZARD_STEP_CONFIG)
  })

  it("uses the same 3 steps in the edit workspace", () => {
    const workspace = { ...mapOnly, editWorkspace: true }
    assert.deepEqual(visibleWizardSteps(workspace), [
      WIZARD_STEP_IDENTITY,
      WIZARD_STEP_TICKETS,
      WIZARD_STEP_CONFIG,
    ])
    assert.equal(
      nextWizardStep(WIZARD_STEP_IDENTITY, workspace),
      WIZARD_STEP_TICKETS,
    )
    assert.equal(
      nextWizardStep(WIZARD_STEP_TICKETS, workspace),
      WIZARD_STEP_CONFIG,
    )
    assert.equal(
      prevWizardStep(WIZARD_STEP_CONFIG, workspace),
      WIZARD_STEP_TICKETS,
    )
  })

  it("parses edit workspace query keys", () => {
    assert.equal(parseEditWorkspaceStep("info"), WIZARD_STEP_IDENTITY)
    assert.equal(parseEditWorkspaceStep("map"), WIZARD_STEP_IDENTITY)
    assert.equal(parseEditWorkspaceStep("place"), WIZARD_STEP_IDENTITY)
    assert.equal(parseEditWorkspaceStep("pricing"), WIZARD_STEP_TICKETS)
    assert.equal(parseEditWorkspaceStep("config"), WIZARD_STEP_CONFIG)
    assert.equal(parseEditWorkspaceStep("unknown"), WIZARD_STEP_IDENTITY)
    assert.equal(editWorkspaceStepKey(WIZARD_STEP_TICKETS), "pricing")
    assert.equal(editWorkspaceStepKey(WIZARD_STEP_CONFIG), "config")
  })

  it("uses update actions only for events already in review or live", () => {
    assert.equal(usesWizardUpdateActions(undefined), false)
    assert.equal(usesWizardUpdateActions("draft"), false)
    assert.equal(usesWizardUpdateActions("needs_revision"), false)
    assert.equal(usesWizardUpdateActions("rejected"), false)
    assert.equal(usesWizardUpdateActions("pending_approval"), true)
    assert.equal(usesWizardUpdateActions("published"), true)
    assert.equal(usesWizardUpdateActions("paused"), true)
  })
})
