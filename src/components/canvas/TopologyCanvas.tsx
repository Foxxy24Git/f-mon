"use client";

// Wrapper React Flow untuk canvas topologi (CLAUDE.md §6).
// Mode terkontrol (controlled): nodes/edges dipegang di state supaya bisa
// - toggle Edit/View,
// - auto-save posisi (debounce 800ms) + Save manual,
// - undo/redo (pindah node, hapus node, hapus edge, tambah edge),
// - edit properti node/edge lewat PropertyPanel.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import DeviceNode from "./DeviceNode";
import BoxNode from "./BoxNode";
import TextNode from "./TextNode";
import LinkEdge from "./LinkEdge";
import NodePalette, { DND_MIME } from "./NodePalette";
import CanvasToolbar, { type SaveStatus } from "./CanvasToolbar";
import PropertyPanel from "./PropertyPanel";
import { iconFor } from "@/lib/icons";

const SNAP_GRID: [number, number] = [16, 16];
const NODE_TYPES: NodeTypes = { device: DeviceNode, box: BoxNode, text: TextNode };
const EDGE_TYPES: EdgeTypes = { link: LinkEdge };
const SAVE_DEBOUNCE_MS = 800;

// tipe node dekoratif (kotak/teks) → disimpan ke /api/annotations, bukan /api/nodes.
const isAnn = (type?: string): boolean => type === "box" || type === "text";
const posPatchUrl = (id: string, type?: string): string =>
  `${isAnn(type) ? "/api/annotations" : "/api/nodes"}/${id}`;

type Props = { nodes: Node[]; edges: Edge[]; annotations: Node[]; mapId: string; canEdit: boolean };

// Satu langkah undo = sepasang fungsi. undo() membalik aksi, redo() mengulanginya.
// Cukup fleksibel untuk pindah/tambah/hapus tanpa bikin switch besar.
type HistoryEntry = { undo: () => void | Promise<void>; redo: () => void | Promise<void> };

const JSON_HEADERS = { "Content-Type": "application/json" };

// ── konversi bentuk DB ↔ React Flow (dipakai saat membuat/mengembalikan) ──
type DbEdge = {
  id: string; sourceId: string; targetId: string;
  sourceHandle: string | null; targetHandle: string | null;
  lineType: string; color: string; width: number; label: string | null; animated: boolean;
};
function dbEdgeToRF(e: DbEdge): Edge {
  return {
    id: e.id, source: e.sourceId, target: e.targetId,
    sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined,
    type: "link", animated: e.animated,
    data: { lineType: e.lineType, color: e.color, width: e.width, label: e.label ?? undefined },
  };
}
async function createEdgeInDB(mapId: string, e: Edge): Promise<Edge> {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const res = await fetch("/api/edges", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({
      mapId, sourceId: e.source, targetId: e.target,
      sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null,
      lineType: d.lineType, color: d.color, width: d.width, label: d.label,
    }),
  });
  return dbEdgeToRF(await res.json());
}

// Node lengkap dari DB (untuk mengembalikan node yang dihapus PERSIS seperti semula).
type DbNode = {
  id: string; name: string; ipAddress: string; type: string; region: string | null;
  branch: string | null; parentId: string | null; intervalSec: number; latencyWarnMs: number;
  enabled: boolean; mapId: string; posX: number; posY: number; icon: string; size: number;
  labelMode: string; status: string; lastLatency: number | null;
};
function dbNodeToRF(n: DbNode): Node {
  return {
    id: n.id, type: "device", position: { x: n.posX, y: n.posY },
    data: {
      name: n.name, ipAddress: n.ipAddress, icon: n.icon, size: n.size,
      labelMode: n.labelMode, status: n.status, latency: n.lastLatency, parentId: n.parentId,
    },
  };
}
async function createNodeInDB(n: DbNode): Promise<Node> {
  const res = await fetch("/api/nodes", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(n) });
  return dbNodeToRF(await res.json());
}

// ── Annotation (kotak daerah / teks) ↔ React Flow ──
type DbAnn = {
  id: string; mapId: string; kind: string; posX: number; posY: number;
  width: number; height: number; text: string; color: string; fontSize: number;
};
function annToRF(a: DbAnn): Node {
  const isText = a.kind === "TEXT";
  return {
    id: a.id,
    type: isText ? "text" : "box",
    position: { x: a.posX, y: a.posY },
    // kotak jadi latar: render di belakang device node. teks tetap normal.
    ...(isText ? {} : { zIndex: -1, style: { width: a.width, height: a.height } }),
    data: { text: a.text, color: a.color, fontSize: a.fontSize, width: a.width, height: a.height },
  };
}
// payload untuk membuat/mengembalikan annotation dari sebuah RF node.
function annPayload(n: Node): Omit<DbAnn, "id" | "mapId"> {
  const d = (n.data ?? {}) as Record<string, number | string>;
  return {
    kind: n.type === "text" ? "TEXT" : "BOX",
    posX: n.position.x, posY: n.position.y,
    width: Number(n.style?.width ?? d.width ?? 320),
    height: Number(n.style?.height ?? d.height ?? 180),
    text: String(d.text ?? ""), color: String(d.color ?? "#f97316"), fontSize: Number(d.fontSize ?? 14),
  };
}
async function createAnnInDB(mapId: string, payload: Omit<DbAnn, "id" | "mapId">): Promise<Node> {
  const res = await fetch("/api/annotations", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ mapId, ...payload }) });
  return annToRF(await res.json());
}

function Flow({ nodes: initNodes, edges: initEdges, annotations: initAnn, mapId, canEdit }: Props) {
  // annotation di depan array → device node & edge tergambar di atasnya (jadi latar).
  const [nodes, setNodes, onNodesChange] = useNodesState([...initAnn, ...initNodes]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const { screenToFlowPosition, deleteElements } = useReactFlow();

  // id → type node, biar auto-save posisi tahu endpoint mana (nodes vs annotations).
  const typeById = useRef<Map<string, string | undefined>>(new Map());
  typeById.current = new Map(nodes.map((n) => [n.id, n.type]));

  // Non-ADMIN mulai (dan terkunci) di mode View.
  const [editMode, setEditMode] = useState(canEdit);
  const [snap, setSnap] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  // simpan ID seleksi, bukan snapshot node/edge, supaya panel selalu baca data
  // TERBARU dari state (mis. setelah ganti icon/parent) — bukan versi lama.
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const selNode = selNodeId ? nodes.find((n) => n.id === selNodeId) ?? null : null;
  const selEdge = selEdgeId ? edges.find((e) => e.id === selEdgeId) ?? null : null;

  // ── auto-save posisi (debounce) ──
  const dirtyPos = useRef<Map<string, { x: number; y: number }>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const pending = [...dirtyPos.current.entries()];
    dirtyPos.current.clear();
    if (!pending.length) return;
    setSaveStatus("saving");
    await Promise.all(
      pending.map(([id, p]) =>
        fetch(posPatchUrl(id, typeById.current.get(id)), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ posX: p.x, posY: p.y }) }),
      ),
    );
    setSaveStatus("saved");
  }, []);

  const scheduleSave = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  const handleNodesChange = useCallback<typeof onNodesChange>(
    (changes) => {
      onNodesChange(changes);
      let moved = false;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          dirtyPos.current.set(c.id, c.position);
          moved = true;
        }
      }
      if (moved) scheduleSave();
    },
    [onNodesChange, scheduleSave],
  );

  // ── undo/redo ──
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const [, bump] = useReducer((x: number) => x + 1, 0); // paksa re-render tombol

  const pushHistory = useCallback((entry: HistoryEntry) => {
    undoStack.current.push(entry);
    redoStack.current = [];
    bump();
  }, []);
  const doUndo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    await entry.undo();
    redoStack.current.push(entry);
    bump();
  }, []);
  const doRedo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    await entry.redo();
    undoStack.current.push(entry);
    bump();
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z (abaikan kalau sedang mengetik di form panel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // ── pindah node → catat undo (posisi awal ditangkap saat mulai drag) ──
  const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
  const onNodeDragStart = useCallback((_e: unknown, _n: Node, dragged: Node[]) => {
    for (const n of dragged) dragStart.current.set(n.id, { ...n.position });
  }, []);
  const onNodeDragStop = useCallback(
    (_e: unknown, _n: Node, dragged: Node[]) => {
      const moves: { id: string; type?: string; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
      for (const n of dragged) {
        const from = dragStart.current.get(n.id);
        if (from && (from.x !== n.position.x || from.y !== n.position.y))
          moves.push({ id: n.id, type: n.type, from, to: { ...n.position } });
      }
      if (!moves.length) return;
      const apply = (pick: "from" | "to") => {
        setNodes((ns) =>
          ns.map((n) => {
            const m = moves.find((mm) => mm.id === n.id);
            return m ? { ...n, position: m[pick] } : n;
          }),
        );
        for (const m of moves)
          fetch(posPatchUrl(m.id, m.type), { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ posX: m[pick].x, posY: m[pick].y }) });
      };
      pushHistory({ undo: () => apply("from"), redo: () => apply("to") });
    },
    [setNodes, pushHistory],
  );

  // ── tambah edge (tarik dari handle) → simpan + catat undo ──
  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target) return;
      const created = await createEdgeInDB(mapId, {
        id: "", source: c.source, target: c.target,
        sourceHandle: c.sourceHandle ?? undefined, targetHandle: c.targetHandle ?? undefined,
        data: {},
      });
      setEdges((es) => [...es, created]);
      let rec = created; // id bisa berubah saat redo re-create → simpan yang terbaru
      pushHistory({
        undo: async () => {
          setEdges((es) => es.filter((e) => e.id !== rec.id));
          await fetch(`/api/edges/${rec.id}`, { method: "DELETE" });
        },
        redo: async () => {
          rec = await createEdgeInDB(mapId, rec);
          setEdges((es) => [...es, rec]);
        },
      });
    },
    [mapId, setEdges, pushHistory],
  );

  // ── hapus node dan/atau edge (Backspace) → satu langkah undo gabungan ──
  // React Flow sudah membuang dari state; tugas kita: hapus di DB + catat undo.
  // ponytail: undo mengembalikan node & garis-nya + parentId node itu sendiri,
  // TAPI belum me-link ulang anak-anaknya (parentId anak sudah SetNull). Edge
  // case ini ditunda; tambahkan kalau menghapus node ber-anak jadi sering.
  const onDelete = useCallback(
    async ({ nodes: delNodes, edges: delEdges }: { nodes: Node[]; edges: Edge[] }) => {
      const devNodes = delNodes.filter((n) => !isAnn(n.type));
      const annNodes = delNodes.filter((n) => isAnn(n.type));
      // device: ambil data lengkap SEBELUM dihapus, biar kembali persis (id sama).
      const fullNodes: DbNode[] = await Promise.all(
        devNodes.map((n) => fetch(`/api/nodes/${n.id}`).then((r) => r.json())),
      );
      // annotation: cukup payload dari RF node (tak dirujuk siapa pun, id boleh baru).
      const annPayloads = annNodes.map(annPayload);
      let annIds = annNodes.map((n) => n.id);

      await Promise.all([
        ...devNodes.map((n) => fetch(`/api/nodes/${n.id}`, { method: "DELETE" })),
        ...annIds.map((id) => fetch(`/api/annotations/${id}`, { method: "DELETE" })),
        ...delEdges.map((e) => fetch(`/api/edges/${e.id}`, { method: "DELETE" })),
      ]);

      let savedEdges = delEdges;
      pushHistory({
        undo: async () => {
          const rfNodes = await Promise.all(fullNodes.map(createNodeInDB));
          const rfAnns = await Promise.all(annPayloads.map((p) => createAnnInDB(mapId, p)));
          const rfEdges = await Promise.all(savedEdges.map((e) => createEdgeInDB(mapId, e)));
          savedEdges = rfEdges; // id baru → dipakai redo untuk menghapus lagi
          annIds = rfAnns.map((n) => n.id);
          setNodes((ns) => [...ns, ...rfNodes, ...rfAnns]);
          setEdges((es) => [...es, ...rfEdges]);
        },
        redo: async () => {
          const nIds = new Set([...fullNodes.map((n) => n.id), ...annIds]);
          const eIds = new Set(savedEdges.map((e) => e.id));
          setNodes((ns) => ns.filter((n) => !nIds.has(n.id)));
          setEdges((es) => es.filter((e) => !eIds.has(e.id)));
          await Promise.all([
            ...fullNodes.map((n) => fetch(`/api/nodes/${n.id}`, { method: "DELETE" })),
            ...annIds.map((id) => fetch(`/api/annotations/${id}`, { method: "DELETE" })),
            ...[...eIds].map((id) => fetch(`/api/edges/${id}`, { method: "DELETE" })),
          ]);
        },
      });
    },
    [mapId, setNodes, setEdges, pushHistory],
  );

  // ── seleksi → PropertyPanel (hanya SATU node ATAU SATU edge) ──
  const onSelectionChange = useCallback(({ nodes: sn, edges: se }: OnSelectionChangeParams) => {
    setSelNodeId(sn.length === 1 ? sn[0].id : null);
    setSelEdgeId(sn.length === 0 && se.length === 1 ? se[0].id : null);
  }, []);

  // ── edit properti dari panel: patch state canvas + simpan ke DB ──
  const onUpdateNode = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      // parentId tidak mengubah visual node, jadi jangan tulis ke data tampilan.
      const dataKeys = ["name", "icon", "size", "labelMode", "parentId"];
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          const data = { ...n.data };
          for (const k of dataKeys) if (k in patch) (data as Record<string, unknown>)[k] = patch[k];
          return { ...n, data };
        }),
      );
      fetch(`/api/nodes/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
    },
    [setNodes],
  );
  const onUpdateEdge = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...e.data, ...patch } } : e)));
      fetch(`/api/edges/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
    },
    [setEdges],
  );
  // hapus elemen yang sedang terpilih dari tombol panel. deleteElements memicu
  // onDelete yang sama seperti tombol Backspace → hapus DB + undo ikut jalan.
  const onDeleteSelected = useCallback(() => {
    deleteElements({ nodes: selNode ? [selNode] : [], edges: selEdge ? [selEdge] : [] });
  }, [deleteElements, selNode, selEdge]);

  // annotation: patch data (text/color/fontSize) → state + /api/annotations.
  const onUpdateAnnotation = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
      fetch(`/api/annotations/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) });
    },
    [setNodes],
  );

  // keluar dari mode Edit → tutup panel & buang seleksi.
  const toggleMode = useCallback(() => {
    if (!canEdit) return; // non-ADMIN tidak boleh masuk mode Edit
    setEditMode((m) => {
      if (m) { setSelNodeId(null); setSelEdgeId(null); }
      return !m;
    });
  }, [canEdit]);

  // ── drop icon dari palette (hanya di mode Edit) ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!editMode) return;
      const key = e.dataTransfer.getData(DND_MIME);
      if (!key) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      // ── kotak daerah / teks (annotation) ──
      if (key === "annotation:box" || key === "annotation:text") {
        const kind = key === "annotation:text" ? "TEXT" : "BOX";
        const text = window.prompt(kind === "TEXT" ? "Isi teks:" : "Nama daerah (label kotak, boleh kosong):")?.trim();
        if (kind === "TEXT" && !text) return; // teks kosong tak ada gunanya; kotak boleh kosong
        const created = await createAnnInDB(mapId, {
          kind, posX: pos.x, posY: pos.y,
          width: kind === "TEXT" ? 200 : 320, height: kind === "TEXT" ? 40 : 180,
          text: text ?? "", color: "#f97316", fontSize: kind === "TEXT" ? 18 : 14,
        });
        setNodes((ns) => [...ns, created]);
        let rec = created;
        pushHistory({
          undo: async () => { setNodes((ns) => ns.filter((n) => n.id !== rec.id)); await fetch(`/api/annotations/${rec.id}`, { method: "DELETE" }); },
          redo: async () => { rec = await createAnnInDB(mapId, annPayload(rec)); setNodes((ns) => [...ns, rec]); },
        });
        return;
      }

      const meta = iconFor(key);
      // ponytail: prompt sementara. Ganti dengan form saat sudah ada.
      const ipAddress = window.prompt(`IP untuk ${meta.label} baru:`)?.trim();
      if (!ipAddress) return;
      const res = await fetch("/api/nodes", {
        method: "POST", headers: JSON_HEADERS,
        body: JSON.stringify({ name: `${meta.label} ${ipAddress}`, ipAddress, type: meta.type, icon: key, mapId, posX: pos.x, posY: pos.y }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        window.alert(error ?? "Gagal membuat node");
        return;
      }
      const created = dbNodeToRF(await res.json());
      setNodes((ns) => [...ns, created]);
    },
    [editMode, screenToFlowPosition, mapId, setNodes, pushHistory],
  );

  return (
    // Palette dipindah ke sini (dulu di page.tsx) supaya ikut hilang di mode View:
    // editMode itu state client, page.tsx (server component) tak bisa melihatnya.
    <div className="flex h-full w-full">
      {editMode && <NodePalette />}
      <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop}>
        <CanvasToolbar
          canEdit={canEdit}
          editMode={editMode}
          onToggleMode={toggleMode}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((g) => !g)}
          snap={snap}
          onToggleSnap={() => setSnap((s) => !s)}
          saveStatus={saveStatus}
          onSave={flushSave}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
          onUndo={doUndo}
          onRedo={doRedo}
        />
        {editMode && (
          <PropertyPanel
            node={selNode}
            edge={selEdge}
            allNodes={nodes}
            onUpdateNode={onUpdateNode}
            onUpdateEdge={onUpdateEdge}
            onUpdateAnnotation={onUpdateAnnotation}
            onDelete={onDeleteSelected}
          />
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onConnect={onConnect}
          onDelete={onDelete}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onSelectionChange={onSelectionChange}
          // kotak daerah harus tetap di zIndex -1 walau terpilih (default RF menaikkannya)
          elevateNodesOnSelect={false}
          nodesDraggable={editMode}
          nodesConnectable={editMode}
          elementsSelectable={editMode}
          minZoom={0.1}
          maxZoom={3}
          snapToGrid={snap}
          snapGrid={SNAP_GRID}
          onlyRenderVisibleElements
          fitView
          proOptions={{ hideAttribution: true }}
        >
          {/* grid & minimap ikut hilang di mode View — fokus ke status node */}
          {editMode && showGrid && <Background variant={BackgroundVariant.Dots} gap={16} size={1} />}
          {editMode && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function TopologyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
