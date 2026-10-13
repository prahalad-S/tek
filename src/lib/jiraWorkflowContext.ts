import type { JiraAssignedIssue } from "./jiraActions";
let pending: JiraAssignedIssue | null = null;
export function prepareJiraWorkflow(issue: JiraAssignedIssue) { pending = issue; }
export function takeJiraWorkflow() { const issue = pending; pending = null; return issue; }
export function clearJiraWorkflow() { pending = null; }

export function pendingJiraProject() { return pending?.project || ""; }

export type JarvisWorkflowMode = "approval" | "auto";
let workflowMode: JarvisWorkflowMode = "approval";
export function setJiraWorkflowMode(mode: JarvisWorkflowMode) { workflowMode = mode; }
export function getJiraWorkflowMode() { return workflowMode; }
