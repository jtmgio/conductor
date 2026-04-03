import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LINEAR_API = "https://api.linear.app/graphql";

const STATUS_MAP: Record<string, string> = {
  Backlog: "backlog",
  Todo: "backlog",
  Triage: "backlog",
  "In Progress": "in_progress",
  "In Review": "in_review",
  Done: "done",
  Canceled: "done",
  Cancelled: "done",
  Duplicate: "done",
};

function mapPriority(linearPriority: number): string {
  return linearPriority === 1 ? "urgent" : "normal";
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  state: { name: string };
  labels: { nodes: Array<{ name: string }> };
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

async function fetchLinearIssues(apiKey: string, teamId: string, userId: string): Promise<LinearIssue[]> {
  const query = `
    query AssignedIssues($teamId: String!, $userId: String!) {
      issues(
        filter: {
          team: { id: { eq: $teamId } }
          assignee: { id: { eq: $userId } }
          state: { type: { nin: ["completed", "canceled"] } }
        }
        orderBy: updatedAt
        first: 100
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          labels { nodes { name } }
          assignee { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `;

  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: { teamId, userId } }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`Linear GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data.issues.nodes;
}

async function fetchCompletedIssues(apiKey: string, teamId: string, userId: string, since: Date): Promise<LinearIssue[]> {
  const query = `
    query CompletedIssues($teamId: String!, $userId: String!, $since: DateTime!) {
      issues(
        filter: {
          team: { id: { eq: $teamId } }
          assignee: { id: { eq: $userId } }
          state: { type: { in: ["completed", "canceled"] } }
          updatedAt: { gte: $since }
        }
        first: 50
      ) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          labels { nodes { name } }
          assignee { id name }
          createdAt
          updatedAt
          url
        }
      }
    }
  `;

  const response = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables: { teamId, userId, since: since.toISOString() } }),
  });

  const data = await response.json();
  return data.data?.issues?.nodes || [];
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("x-sync-secret");
  const syncSecret = process.env.LINEAR_SYNC_SECRET;
  if (syncSecret && authHeader !== syncSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findUnique({
    where: { type: "linear" },
  });

  if (!integration?.enabled) {
    return NextResponse.json({ error: "Linear integration not configured or disabled" }, { status: 404 });
  }

  const config = integration.config as { apiKey: string; teamId: string; userId: string; roleId: string };
  const { apiKey, teamId, userId, roleId } = config;

  if (!apiKey || !teamId || !userId || !roleId) {
    return NextResponse.json({ error: "Linear integration missing required config" }, { status: 400 });
  }

  try {
    const linearIssues = await fetchLinearIssues(apiKey, teamId, userId);

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const issue of linearIssues) {
      const sourceId = `linear-${issue.id}`;
      const conductorStatus = STATUS_MAP[issue.state.name] || "backlog";
      const conductorPriority = mapPriority(issue.priority);
      const title = `${issue.identifier}: ${issue.title}`;

      const existing = await prisma.task.findFirst({
        where: { sourceType: "linear", sourceId },
      });

      if (existing) {
        const needsUpdate =
          existing.title !== title ||
          existing.status !== conductorStatus ||
          existing.priority !== conductorPriority;

        if (needsUpdate) {
          await prisma.task.update({
            where: { id: existing.id },
            data: {
              title,
              status: conductorStatus,
              priority: conductorPriority,
              notes: issue.description?.slice(0, 1000) || existing.notes,
            },
          });
          updated++;
        } else {
          unchanged++;
        }
      } else {
        const task = await prisma.task.create({
          data: {
            roleId,
            title,
            priority: conductorPriority,
            status: conductorStatus,
            sourceType: "linear",
            sourceId,
            notes: [
              issue.description?.slice(0, 1000),
              `\nLinear: ${issue.url}`,
            ].filter(Boolean).join("\n"),
          },
        });

        const linearTags = issue.labels.nodes.map((l) => l.name.toLowerCase());
        const allTagNames = ["linear", ...linearTags];
        for (const tagName of allTagNames) {
          const tag = await prisma.tag.upsert({
            where: { name: tagName },
            update: {},
            create: { name: tagName, color: tagName === "linear" ? "#5E6AD2" : undefined },
          });
          await prisma.taskTag
            .create({ data: { taskId: task.id, tagId: tag.id } })
            .catch(() => {});
        }

        created++;
      }
    }

    let completed = 0;
    const lastSync = integration.lastSyncAt || new Date(Date.now() - 2 * 60 * 60 * 1000);
    const completedIssues = await fetchCompletedIssues(apiKey, teamId, userId, lastSync);

    for (const issue of completedIssues) {
      const sourceId = `linear-${issue.id}`;
      const existing = await prisma.task.findFirst({
        where: { sourceType: "linear", sourceId, done: false },
      });

      if (existing) {
        await prisma.task.update({
          where: { id: existing.id },
          data: { done: true, doneAt: new Date() },
        });
        completed++;
      }
    }

    const resultSummary = `${created} new, ${updated} updated, ${unchanged} unchanged, ${completed} completed`;
    await prisma.integration.update({
      where: { type: "linear" },
      data: {
        lastSyncAt: new Date(),
        lastSyncResult: `success: ${resultSummary}`,
      },
    });

    return NextResponse.json({
      success: true,
      linearIssuesFound: linearIssues.length,
      created,
      updated,
      unchanged,
      completed,
      summary: resultSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Linear sync error:", message);

    await prisma.integration
      .update({
        where: { type: "linear" },
        data: { lastSyncResult: `error: ${message}` },
      })
      .catch(() => {});

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
