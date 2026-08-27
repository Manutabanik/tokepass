import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { emptyEventDraftV2 } from "@/lib/validations/event-draft-v2"

import {
  applyDraftIssuesToForm,
  collectDraftPublishIssues,
  editorStepForFieldPath,
  editorStepsWithFieldErrors,
  editorStepsWithIssues,
  editorTabAlert,
  firstDraftPublishIssue,
  nextEditorStep,
  prevEditorStep,
} from "./editor-v2-steps"

describe("editorStepForFieldPath", () => {
  it("maps identity, inventory and launch fields to their tab", () => {
    assert.equal(editorStepForFieldPath(["basicInfo", "name"]), 1)
    assert.equal(editorStepForFieldPath("location.venueName"), 1)
    assert.equal(editorStepForFieldPath(["schedule", 0, "startDate"]), 1)
    assert.equal(editorStepForFieldPath(["tickets", 0, "name"]), 2)
    assert.equal(editorStepForFieldPath("venueCapacity"), 2)
    assert.equal(editorStepForFieldPath("extras.1.stock"), 2)
    assert.equal(editorStepForFieldPath("settings.absorbFees"), 3)
  })
})

describe("collectDraftPublishIssues", () => {
  it("flags an empty draft on information and inventory tabs", () => {
    const issues = collectDraftPublishIssues(emptyEventDraftV2())
    assert.ok(issues.length > 0)
    const steps = editorStepsWithIssues(issues)
    assert.equal(steps.has(1), true)
    assert.equal(steps.has(2), true)
    const first = firstDraftPublishIssue(issues)
    assert.ok(first)
    assert.ok(first.name.length > 0)
  })
})

describe("editorStepsWithFieldErrors", () => {
  it("reads nested RHF errors without inventing a tab", () => {
    const steps = editorStepsWithFieldErrors({
      basicInfo: { name: { type: "manual", message: "El nombre es obligatorio" } },
      tickets: { root: { type: "manual", message: "Agregá al menos una entrada" } },
    })
    assert.equal(steps.has(1), true)
    assert.equal(steps.has(2), true)
    assert.equal(steps.has(3), false)
  })
})

describe("editorTabAlert", () => {
  it("prefers a red RHF error over an incomplete schema warning", () => {
    assert.equal(
      editorTabAlert(1, {
        fieldErrorSteps: new Set([1]),
        schemaIssueSteps: new Set([1, 2]),
      }),
      "error",
    )
    assert.equal(
      editorTabAlert(2, {
        fieldErrorSteps: new Set([1]),
        schemaIssueSteps: new Set([1, 2]),
      }),
      "warn",
    )
    assert.equal(
      editorTabAlert(3, {
        fieldErrorSteps: new Set([1]),
        schemaIssueSteps: new Set([1, 2]),
      }),
      null,
    )
  })
})

describe("editor step navigation", () => {
  it("walks 1-2-3 without wrapping", () => {
    assert.equal(nextEditorStep(1), 2)
    assert.equal(nextEditorStep(2), 3)
    assert.equal(nextEditorStep(3), null)
    assert.equal(prevEditorStep(1), null)
    assert.equal(prevEditorStep(2), 1)
    assert.equal(prevEditorStep(3), 2)
  })
})

describe("applyDraftIssuesToForm", () => {
  it("writes each issue onto the matching field path", () => {
    const written: Array<{ name: string; message: string }> = []
    applyDraftIssuesToForm((name, error) => {
      written.push({ name, message: error.message })
    }, [
      {
        path: ["basicInfo", "name"],
        name: "basicInfo.name",
        message: "El nombre es obligatorio",
        step: 1,
      },
    ])
    assert.deepEqual(written, [
      { name: "basicInfo.name", message: "El nombre es obligatorio" },
    ])
  })
})
