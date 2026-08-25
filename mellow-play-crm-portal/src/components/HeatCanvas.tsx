import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import {
  Add as AddIcon,
  OpenInFull as ExpandIcon,
  CloseFullscreen as CollapseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CenterFocusStrong as FitIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  GroupAdd as PickIcon,
} from '@mui/icons-material';

/**
 * The bracket as a canvas: boxes go where they are put, and the lines between
 * them are what decides who advances.
 *
 * It replaces a fixed column-per-stage layout. That layout was the advancement
 * rule drawn out — stage N spread into stage N+1 by position — so the picture
 * could not be rearranged without changing who plays whom, and two brackets
 * whose winners meet could not be drawn at all. Here the line is the rule, so
 * the arrangement is free.
 *
 * Deliberately no graph library. The whole interaction is three pointer
 * gestures over an SVG, and a dependency for that would be larger than the
 * component.
 */

export interface CanvasHeat {
  id: number;
  name: string;
  stage_index: number;
  sort_order: number;
  status?: string | null;
  note?: string | null;
  capacity?: number | null;
  advance_count?: number | null;
  pos_x?: number | null;
  pos_y?: number | null;
}

export interface CanvasLink { from_heat_id: number; to_heat_id: number }

export interface CanvasEntry { id: number; heat_id: number; label: string; result_rank?: number | null }

const BOX_W = 230;
const BOX_MIN_H = 96;
const ROW_H = 20;
const GRID = 10;
// Where a heat lands when it has never been dragged: its old column, its old
// row. Opening the canvas for the first time shows the bracket that was
// already there rather than a pile in the corner.
const AUTO_X = 300;
const AUTO_Y = 190;

type Point = { x: number; y: number };

const heightOf = (count: number) => Math.max(BOX_MIN_H, 62 + Math.max(1, count) * ROW_H);
const snap = (v: number) => Math.round(v / GRID) * GRID;

/** A left-to-right cubic, so lines read as flow rather than as a web of straights. */
const curve = (a: Point, b: Point) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};

const HeatCanvas: React.FC<{
  heats: CanvasHeat[];
  links: CanvasLink[];
  entries: CanvasEntry[];
  onMoveHeats: (positions: { id: number; x: number; y: number }[]) => void;
  onAddLink: (fromId: number, toId: number) => void;
  onDeleteLink: (fromId: number, toId: number) => void;
  onCreateHeatAt: (pos: Point, fromHeatId: number | null) => void;
  onEditHeat: (heatId: number) => void;
  onDeleteHeat: (heatId: number) => void;
  onPickEntries: (heatId: number) => void;
}> = ({ heats, links, entries, onMoveHeats, onAddLink, onDeleteLink, onCreateHeatAt, onEditHeat, onDeleteHeat, onPickEntries }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState<Point>({ x: 40, y: 30 });
  const [zoom, setZoom] = useState(1);

  // Positions live here while dragging so the box follows the pointer at screen
  // rate; the server hears about it once, on release.
  const [pos, setPos] = useState<Record<number, Point>>({});
  const [dragging, setDragging] = useState<{ id: number; grabDx: number; grabDy: number } | null>(null);
  const [panning, setPanning] = useState<Point | null>(null);
  const [linking, setLinking] = useState<{ fromId: number; at: Point } | null>(null);
  // Full-screen rather than a taller box: a bracket is wide, and the useful
  // gesture is "give me the whole screen for a minute", not "give me 200 more
  // pixels forever".
  const [expanded, setExpanded] = useState(false);

  // Escape leaves full screen. Anything that takes over the screen needs the
  // key everyone already tries.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const entriesByHeat = useMemo(() => {
    const map = new Map<number, CanvasEntry[]>();
    for (const e of entries) {
      if (!map.has(e.heat_id)) map.set(e.heat_id, []);
      map.get(e.heat_id)!.push(e);
    }
    return map;
  }, [entries]);

  // Seeded from the server, falling back to the old stage grid for anything
  // never dragged. Re-runs when a heat is added or removed, never mid-drag.
  useEffect(() => {
    setPos(prev => {
      const next: Record<number, Point> = {};
      for (const h of heats) {
        next[h.id] = prev[h.id] ?? {
          x: h.pos_x != null ? h.pos_x : 40 + h.stage_index * AUTO_X,
          y: h.pos_y != null ? h.pos_y : 30 + h.sort_order * AUTO_Y,
        };
      }
      return next;
    });
  }, [heats]);

  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  }, [pan, zoom]);

  const portOut = (h: CanvasHeat): Point => {
    const p = pos[h.id] ?? { x: 0, y: 0 };
    return { x: p.x + BOX_W, y: p.y + heightOf(entriesByHeat.get(h.id)?.length ?? 0) / 2 };
  };
  const portIn = (h: CanvasHeat): Point => {
    const p = pos[h.id] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y + heightOf(entriesByHeat.get(h.id)?.length ?? 0) / 2 };
  };

  // One move handler for all three gestures — they are mutually exclusive, and
  // three listeners racing on the same pointer is how boxes end up teleporting.
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging) {
      const c = toCanvas(e.clientX, e.clientY);
      setPos(p => ({ ...p, [dragging.id]: { x: snap(c.x - dragging.grabDx), y: snap(c.y - dragging.grabDy) } }));
    } else if (panning) {
      setPan({ x: e.clientX - panning.x, y: e.clientY - panning.y });
    } else if (linking) {
      setLinking({ ...linking, at: toCanvas(e.clientX, e.clientY) });
    }
  };

  const heatAt = (p: Point): CanvasHeat | null => {
    for (const h of heats) {
      const b = pos[h.id];
      if (!b) continue;
      const hh = heightOf(entriesByHeat.get(h.id)?.length ?? 0);
      if (p.x >= b.x && p.x <= b.x + BOX_W && p.y >= b.y && p.y <= b.y + hh) return h;
    }
    return null;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragging) {
      const p = pos[dragging.id];
      if (p) onMoveHeats([{ id: dragging.id, x: p.x, y: p.y }]);
    }
    if (linking) {
      const drop = toCanvas(e.clientX, e.clientY);
      const target = heatAt(drop);
      // Dropped on a box: a line. Dropped on nothing: a new heat, already
      // connected — which is the whole "pull a new one out of this one"
      // gesture, and saves creating then linking as two separate steps.
      if (target && target.id !== linking.fromId) onAddLink(linking.fromId, target.id);
      else if (!target) onCreateHeatAt({ x: snap(drop.x), y: snap(drop.y - 40) }, linking.fromId);
    }
    setDragging(null);
    setPanning(null);
    setLinking(null);
  };

  const fit = () => { setZoom(1); setPan({ x: 40, y: 30 }); };

  const linked = links
    .map(l => ({ l, from: heats.find(h => h.id === l.from_heat_id), to: heats.find(h => h.id === l.to_heat_id) }))
    .filter(x => x.from && x.to) as { l: CanvasLink; from: CanvasHeat; to: CanvasHeat }[];

  return (
    <Box sx={{
      position: expanded ? 'fixed' : 'relative',
      ...(expanded ? { inset: 0, zIndex: 1400, borderRadius: 0 } : { borderRadius: 3 }),
      border: '1px solid #eef0f3', overflow: 'hidden', bgcolor: '#fbfbfd',
    }}>
      <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 3, display: 'flex', gap: 0.5, bgcolor: 'white', borderRadius: 2, boxShadow: 1, p: 0.5 }}>
        <Tooltip title="ย่อ"><IconButton size="small" onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}><ZoomOutIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="ขยาย"><IconButton size="small" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))}><ZoomInIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title="กลับไปมุมมองเริ่มต้น"><IconButton size="small" onClick={fit}><FitIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title={expanded ? 'ออกจากเต็มจอ (Esc)' : 'ขยายเต็มจอ'}>
          <IconButton size="small" onClick={() => setExpanded(v => !v)}>
            {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onCreateHeatAt({ x: snap(-pan.x / zoom + 60), y: snap(-pan.y / zoom + 60) }, null)} sx={{ fontWeight: 700 }}>
          เพิ่ม Heat
        </Button>
      </Box>

      <Box sx={{ position: 'absolute', bottom: 8, left: 12, zIndex: 3, pointerEvents: 'none' }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
          ลากกล่องเพื่อจัดตำแหน่ง · ลากจากจุดขวาของกล่องไปยังอีกกล่องเพื่อเชื่อม · ปล่อยที่พื้นที่ว่างเพื่อสร้าง Heat ใหม่ต่อจากกล่องนั้น · คลิกเส้นเพื่อลบ
        </Typography>
      </Box>

      <Box
        ref={wrapRef}
        // Pan from anywhere that is not a box. The old test asked whether the
        // pointer landed on this exact element, which the transformed layer
        // covers — so most of the canvas did not drag, which reads as the
        // canvas being stuck rather than as a rule about where to grab.
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest('[data-heat-box]')) return;
          setPanning({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        sx={{
          position: 'relative', height: expanded ? '100vh' : 'min(72vh, 760px)', overflow: 'hidden',
          cursor: panning ? 'grabbing' : 'grab', touchAction: 'none',
          backgroundImage: 'radial-gradient(#e3e5ee 1px, transparent 1px)',
          backgroundSize: `${GRID * 2 * zoom}px ${GRID * 2 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        data-bg="1"
      >
        <Box sx={{ position: 'absolute', inset: 0, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}>
          {/* Lines first so boxes sit above them. overflow visible because a
              line can run outside whatever box the SVG happens to be sized to. */}
          <svg width="4000" height="3000" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {linked.map(({ l, from, to }) => {
              const a = portOut(from), b = portIn(to);
              return (
                <g key={`${l.from_heat_id}-${l.to_heat_id}`} style={{ pointerEvents: 'stroke' }}>
                  {/* A fat invisible copy underneath: a 2px curve is almost
                      impossible to click, and clicking is how a line is removed. */}
                  <path d={curve(a, b)} stroke="transparent" strokeWidth={16} fill="none" style={{ cursor: 'pointer' }}
                    onClick={() => onDeleteLink(l.from_heat_id, l.to_heat_id)}>
                    <title>คลิกเพื่อลบเส้นนี้</title>
                  </path>
                  <path d={curve(a, b)} stroke="#7452d6" strokeWidth={2} fill="none" markerEnd="url(#heat-arrow)" opacity={0.65} />
                </g>
              );
            })}
            {linking && (() => {
              const from = heats.find(h => h.id === linking.fromId);
              return from ? <path d={curve(portOut(from), linking.at)} stroke="#7452d6" strokeWidth={2} strokeDasharray="6 4" fill="none" /> : null;
            })()}
            <defs>
              <marker id="heat-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#7452d6" opacity={0.65} />
              </marker>
            </defs>
          </svg>

          {heats.map(h => {
            const p = pos[h.id];
            if (!p) return null;
            const rows = entriesByHeat.get(h.id) ?? [];
            const isFinal = links.every(l => l.from_heat_id !== h.id);
            return (
              <Box
                key={h.id}
                data-heat-box="1"
                sx={{
                  position: 'absolute', left: p.x, top: p.y, width: BOX_W, minHeight: heightOf(rows.length),
                  bgcolor: 'white', borderRadius: 2, border: '1.5px solid', borderColor: isFinal ? '#f0b400' : '#e5e2f5',
                  borderTop: '4px solid', borderTopColor: isFinal ? '#f0b400' : '#7452d6',
                  boxShadow: dragging?.id === h.id ? 6 : 1, userSelect: 'none',
                  transition: dragging?.id === h.id ? 'none' : 'box-shadow 0.15s',
                }}
              >
                <Box
                  onPointerDown={e => {
                    e.stopPropagation();
                    const c = toCanvas(e.clientX, e.clientY);
                    setDragging({ id: h.id, grabDx: c.x - p.x, grabDy: c.y - p.y });
                  }}
                  sx={{ px: 1.25, pt: 0.75, pb: 0.5, cursor: 'move', display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, wordBreak: 'break-word' }}>{h.name}</Typography>
                    {/* "ผ่าน 2" on its own reads as a status, not a rule.
                        Spelled out, it says what it decides. */}
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
                      {rows.length} รายการ
                      {h.advance_count
                        ? ` · ผ่านเข้ารอบ ${h.advance_count} อันดับ`
                        : ' · รอบสุดท้าย'}
                    </Typography>
                  </Box>
                  <IconButton size="small" sx={{ p: 0.25 }} onPointerDown={e => e.stopPropagation()} onClick={() => onEditHeat(h.id)}><EditIcon sx={{ fontSize: 15 }} /></IconButton>
                  <IconButton size="small" color="error" sx={{ p: 0.25 }} onPointerDown={e => e.stopPropagation()} onClick={() => onDeleteHeat(h.id)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton>
                </Box>

                <Box sx={{ px: 1.25, pb: 0.75 }}>
                  {rows.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>ยังไม่มีใครใน Heat นี้</Typography>
                  ) : rows.map((e, i) => (
                    <Typography key={e.id} variant="caption" sx={{ display: 'block', fontWeight: e.result_rank ? 800 : 500, color: e.result_rank ? '#a15c00' : 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.result_rank ? `${e.result_rank}. ` : `${i + 1}. `}{e.label}
                    </Typography>
                  ))}
                  <Button size="small" fullWidth startIcon={<PickIcon sx={{ fontSize: 14 }} />}
                    onPointerDown={ev => ev.stopPropagation()} onClick={() => onPickEntries(h.id)}
                    sx={{ mt: 0.5, fontSize: 11, fontWeight: 700, textTransform: 'none' }}>
                    เลือกผู้เข้าแข่งขัน
                  </Button>
                </Box>

                {/* The output port. Everything about linking starts here, so it
                    is a real target rather than a 6px dot on the border. */}
                <Tooltip title="ลากจากจุดนี้ไปยังกล่องอื่นเพื่อเชื่อม หรือปล่อยที่ว่างเพื่อสร้าง Heat ใหม่">
                  <Box
                    onPointerDown={e => { e.stopPropagation(); setLinking({ fromId: h.id, at: toCanvas(e.clientX, e.clientY) }); }}
                    sx={{
                      position: 'absolute', right: -9, top: heightOf(rows.length) / 2 - 9,
                      width: 18, height: 18, borderRadius: '50%',
                      bgcolor: '#7452d6', border: '2px solid white', boxShadow: 1,
                      cursor: 'crosshair', '&:hover': { transform: 'scale(1.2)' }, transition: 'transform 0.1s',
                    }}
                  />
                </Tooltip>
                <Box sx={{ position: 'absolute', left: -5, top: heightOf(rows.length) / 2 - 5, width: 10, height: 10, borderRadius: '50%', bgcolor: '#cfc7ee' }} />
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default HeatCanvas;
