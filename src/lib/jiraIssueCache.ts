import { jiraRequest, type JiraAssignedIssue } from "./jiraActions";
export type AssignedJiraIssues = { issues: JiraAssignedIssue[] };
export function assignedJiraQuery(userId: string) {
  return {
    queryKey: ["jarvis-assigned-jira",userId],
    queryFn: () => jiraRequest<AssignedJiraIssues>({action:"list"}),
    staleTime: 30000,
    retry: 1,
  };
}
