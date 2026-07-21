import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

type FlowProps = {
  nodes: { id: string; position: { x: number; y: number } }[];
  onNodeDragStop?: (
    event: MouseEvent,
    node: { id: string; position: { x: number; y: number } },
  ) => void;
};
let latestFlowProps: FlowProps | null = null;

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    Background: () => <div data-testid="background" />,
    Controls: () => <div data-testid="controls" />,
    MiniMap: () => <div data-testid="minimap" />,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    useReactFlow: () => ({ fitView: vi.fn() }),
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    useNodesState: (initial: FlowProps["nodes"]) => {
      const [nodes, setNodes] = React.useState(initial);
      latestFlowProps = { nodes };
      return [nodes, setNodes, vi.fn()];
    },
    ReactFlow: (props: FlowProps & { children: ReactNode }) => {
      const wrappedProps = {
        ...props,
        onNodeDragStop: props.onNodeDragStop
          ? (
              event: MouseEvent,
              node: { id: string; position: { x: number; y: number } },
            ) => {
              latestFlowProps = {
                ...(latestFlowProps ?? props),
                nodes: (latestFlowProps?.nodes ?? props.nodes).map((item) =>
                  item.id === node.id
                    ? { ...item, position: node.position }
                    : item,
                ),
              };
              props.onNodeDragStop?.(event, node);
            }
          : undefined,
      };
      latestFlowProps = wrappedProps;
      return (
        <div data-testid="flow">
          {props.nodes.map((node) => (
            <div key={node.id} data-testid={`node-${node.id}`}>
              {node.position.x},{node.position.y}
            </div>
          ))}
          {props.children}
        </div>
      );
    },
  };
});

const graphPayload = {
  nodes: [
    {
      id: "actor:11111111-1111-4111-8111-111111111111",
      entityId: "11111111-1111-4111-8111-111111111111",
      type: "ACTOR",
      label: "APT One",
      detailUrl: "/a",
      metadata: {},
    },
  ],
  edges: [],
  meta: {
    nodeCount: 1,
    edgeCount: 0,
    truncated: false,
    nodeLimit: 500,
    edgeLimit: 1500,
    omittedNodes: 0,
    omittedEdges: 0,
  },
};

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("KnowledgeGraph layout persistence regressions", () => {
  beforeEach(() => {
    latestFlowProps = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it("keeps a newly dragged saved node through style updates and restores it after remount", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(graphPayload))
      .mockResolvedValueOnce(
        okJson({
          positions: [
            {
              entityType: "ACTOR",
              entityId: "11111111-1111-4111-8111-111111111111",
              x: 10,
              y: 20,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(okJson({ saved: 1 }))
      .mockResolvedValueOnce(okJson(graphPayload))
      .mockResolvedValueOnce(
        okJson({
          positions: [
            {
              entityType: "ACTOR",
              entityId: "11111111-1111-4111-8111-111111111111",
              x: 30,
              y: 40,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { KnowledgeGraph } =
      await import("@/components/graph/knowledge-graph");
    const { unmount } = render(<KnowledgeGraph projectId="project-1" />);
    await screen.findByTestId("flow");
    await waitFor(() =>
      expect(latestFlowProps?.nodes[0]?.position).toEqual({ x: 10, y: 20 }),
    );

    latestFlowProps?.onNodeDragStop?.(new MouseEvent("mouseup"), {
      id: "actor:11111111-1111-4111-8111-111111111111",
      position: { x: 30, y: 40 },
    });
    await screen.findByText("Graph layout saved.");
    await userEvent.click(screen.getByLabelText("Search graph"));
    await userEvent.keyboard("apt");
    await waitFor(() =>
      expect(latestFlowProps?.nodes[0]?.position).toEqual({ x: 30, y: 40 }),
    );

    unmount();
    render(<KnowledgeGraph projectId="project-1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await waitFor(() =>
      expect(latestFlowProps?.nodes[0]?.position).toEqual({ x: 30, y: 40 }),
    );
  });

  it("shows a controlled warning when layout GET fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(okJson(graphPayload))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
        ),
    );
    const { KnowledgeGraph } =
      await import("@/components/graph/knowledge-graph");
    render(<KnowledgeGraph projectId="project-1" />);
    expect(
      await screen.findByText(/Saved graph layout could not be loaded/),
    ).toBeInTheDocument();
  });

  it("preserves current layout when reset DELETE fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(graphPayload))
      .mockResolvedValueOnce(
        okJson({
          positions: [
            {
              entityType: "ACTOR",
              entityId: "11111111-1111-4111-8111-111111111111",
              x: 10,
              y: 20,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "delete failed" }), {
          status: 500,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { KnowledgeGraph } =
      await import("@/components/graph/knowledge-graph");
    render(<KnowledgeGraph projectId="project-1" />);
    await screen.findByTestId("flow");
    latestFlowProps?.onNodeDragStop?.(new MouseEvent("mouseup"), {
      id: "actor:11111111-1111-4111-8111-111111111111",
      position: { x: 30, y: 40 },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Reset layout/filters" }),
    );
    expect(
      await screen.findByText(/current layout preserved/),
    ).toBeInTheDocument();
    expect(latestFlowProps?.nodes[0]?.position).toEqual({ x: 30, y: 40 });
  });
});
