import React, { useState, useEffect, useRef } from 'react';
import { 
  Target, 
  Ruler, 
  Trash2, 
  Download, 
  Image as ImageIcon, 
  Grid3X3,
  CheckCircle2,
  ArrowRight,
  ArrowUp,
  Lock,
  Unlock,
  History,
  Eye,
  EyeOff,
  Maximize,
  Hand,
  Info
} from 'lucide-react';

const App = () => {
  // --- CONFIGURAZIONE E STATO ---
  const [sourceW, setSourceW] = useState(28.6);
  const [sourceH, setSourceH] = useState(14.5);
  const [targetW, setTargetW] = useState(50.0); 
  const [targetH, setTargetH] = useState(35.0);
  const [lockRatio, setLockRatio] = useState(false);
  const [bgImage, setBgImage] = useState(null);
  const [bgOpacity, setBgOpacity] = useState(1);
  
  // STATO TRASFORMAZIONE (Infinito & Zoom)
  const [scale, setScale] = useState(1.5);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [userHasInteracted, setUserHasInteracted] = useState(false); 
  
  const [cursorPos, setCursorPos] = useState({ L: "0.0", H: "0.0" });
  const [tool, setTool] = useState('point'); 
  const [shapes, setShapes] = useState([]); 
  const [currentShapePoints, setCurrentShapePoints] = useState([]); 
  const [selectedShapeId, setSelectedShapeId] = useState(null);

  // STATO DRAGGING
  const [draggingPoint, setDraggingPoint] = useState(null); 

  // STATO UNDO / REDO
  const [history, setHistory] = useState([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // STATO STANDBY HUD
  const [isHudStandby, setIsHudStandby] = useState(false);
  const standbyTimerRef = useRef(null);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const basePxPerCm = 20;

  // Funzione di centratura forzata
  const centerCanvas = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const defaultScale = 1.5;
    const sheetPxW = sourceW * basePxPerCm * defaultScale;
    const sheetPxH = sourceH * basePxPerCm * defaultScale;
    
    setScale(defaultScale);
    setOffset({
      x: (container.clientWidth / 2) - (sheetPxW / 2),
      y: (container.clientHeight / 2) - (sheetPxH / 2)
    });
    setUserHasInteracted(false); // Resetta lo stato per permettere l'auto-center al resize
  };

  // Centratura automatica intelligente (solo se l'utente non ha mosso manualmente il foglio)
  const autoCenter = () => {
    if (!containerRef.current || userHasInteracted) return;
    const container = containerRef.current;
    const sheetPxW = sourceW * basePxPerCm * scale;
    const sheetPxH = sourceH * basePxPerCm * scale;
    
    setOffset({
      x: (container.clientWidth / 2) - (sheetPxW / 2),
      y: (container.clientHeight / 2) - (sheetPxH / 2)
    });
  };

  useEffect(() => {
    autoCenter();
  }, [sourceW, sourceH, scale]);

  useEffect(() => {
    window.addEventListener('resize', autoCenter);
    return () => window.removeEventListener('resize', autoCenter);
  }, [sourceW, sourceH, scale, userHasInteracted]);

  // --- LOGICA STORIA ---
  const pushToHistory = (newShapes) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newShapes);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      setHistoryStep(prevStep);
      const restoredShapes = history[prevStep];
      setShapes(restoredShapes);
      const draft = restoredShapes.find(s => s.isDraft);
      setCurrentShapePoints(draft ? draft.points : []);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      setHistoryStep(nextStep);
      const restoredShapes = history[nextStep];
      setShapes(restoredShapes);
      const draft = restoredShapes.find(s => s.isDraft);
      setCurrentShapePoints(draft ? draft.points : []);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyStep, history]);

  const resetStandbyTimer = () => {
    setIsHudStandby(false);
    if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
    standbyTimerRef.current = setTimeout(() => setIsHudStandby(true), 1500); 
  };

  const handleMouseLeaveCanvas = () => {
    setIsHudStandby(true);
    if (standbyTimerRef.current) clearTimeout(standbyTimerRef.current);
  };

  useEffect(() => {
    if (lockRatio && sourceW > 0 && sourceH > 0 && targetW > 0) {
      const ratio = sourceH / sourceW;
      setTargetH(parseFloat((targetW * ratio).toFixed(1)));
    }
  }, [targetW, sourceW, sourceH, lockRatio]);

  const screenToSheet = (clientX, clientY) => {
    if (!canvasRef.current) return { l: 0, h: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - offset.x) / (basePxPerCm * scale);
    const y = (clientY - rect.top - offset.y) / (basePxPerCm * scale);
    return { l: x, h: sourceH - y };
  };

  const sourceToTarget = (l, h) => {
    const scaleX = targetW / sourceW;
    const scaleY = targetH / sourceH;
    return {
      L: (Math.max(0, l) * scaleX).toFixed(1),
      H: (Math.max(0, h) * scaleY).toFixed(1)
    };
  };

  const handleWheel = (e) => {
    e.preventDefault();
    resetStandbyTimer();
    setUserHasInteracted(true);
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    const newScale = Math.min(Math.max(0.1, scale + delta * scale), 200);
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const dx = (mouseX - offset.x) / scale;
    const dy = (mouseY - offset.y) / scale;
    setOffset({ x: mouseX - dx * newScale, y: mouseY - dy * newScale });
    setScale(newScale);
  };

  const handleMouseDown = (e) => {
    resetStandbyTimer();
    const { l, h } = screenToSheet(e.clientX, e.clientY);
    const tolerance = 12 / (basePxPerCm * scale); 

    if (e.ctrlKey) {
      for (const shape of shapes) {
        for (let i = 0; i < shape.points.length; i++) {
          const p = shape.points[i];
          const dist = Math.sqrt(Math.pow(l - p.x, 2) + Math.pow(h - p.y, 2));
          if (dist < tolerance) {
            setDraggingPoint({ shapeId: shape.id, pointIndex: i });
            setSelectedShapeId(shape.id);
            return; 
          }
        }
      }
    }

    if (e.button === 1 || e.altKey || tool === 'pan') {
      setIsPanning(true);
      setUserHasInteracted(true);
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (l < 0 || l > sourceW || h < 0 || h > sourceH) return;

    let snappedL = l;
    let snappedH = h;
    for (const shape of shapes) {
      for (const p of shape.points) {
        const dist = Math.sqrt(Math.pow(l - p.x, 2) + Math.pow(h - p.y, 2));
        if (dist < tolerance) {
          snappedL = p.x;
          snappedH = p.y;
          break;
        }
      }
    }

    const newPoint = { x: snappedL, y: snappedH, target: sourceToTarget(snappedL, snappedH) };

    if (tool === 'point') {
      const newShape = { id: Date.now(), type: 'Punto', points: [newPoint], color: '#10b981', visible: true };
      const nextShapes = [...shapes, newShape];
      setShapes(nextShapes); pushToHistory(nextShapes); setSelectedShapeId(newShape.id);
    } else if (tool === 'line') {
      if (currentShapePoints.length === 0) {
        const tempId = Date.now();
        const nextShapes = [...shapes, { id: tempId, type: 'Linea', points: [newPoint], color: '#3b82f6', visible: true, isDraft: true }];
        setCurrentShapePoints([newPoint]); setShapes(nextShapes); pushToHistory(nextShapes); setSelectedShapeId(tempId);
      } else {
        const nextShapes = shapes.map(s => s.isDraft ? { ...s, points: [currentShapePoints[0], newPoint], isDraft: false } : s);
        setShapes(nextShapes); pushToHistory(nextShapes); setCurrentShapePoints([]);
      }
    } else if (tool === 'polygon') {
      if (currentShapePoints.length === 0) {
        const tempId = Date.now();
        const nextShapes = [...shapes, { id: tempId, type: 'Area', points: [newPoint], color: '#8b5cf6', visible: true, isDraft: true }];
        setCurrentShapePoints([newPoint]); setShapes(nextShapes); pushToHistory(nextShapes); setSelectedShapeId(tempId);
      } else {
        const nextShapes = shapes.map(s => s.isDraft ? { ...s, points: [...s.points, newPoint] } : s);
        setCurrentShapePoints(prev => [...prev, newPoint]); setShapes(nextShapes); pushToHistory(nextShapes);
      }
    }
  };

  const handleMouseMove = (e) => {
    resetStandbyTimer();
    const { l, h } = screenToSheet(e.clientX, e.clientY);
    const clampedL = Math.max(0, Math.min(l, sourceW));
    const clampedH = Math.max(0, Math.min(h, sourceH));
    
    setCursorPos(sourceToTarget(clampedL, clampedH));

    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    if (draggingPoint) {
      let finalL = clampedL;
      let finalH = clampedH;
      const tolerance = 10 / (basePxPerCm * scale);
      
      for (const shape of shapes) {
        for (let i = 0; i < shape.points.length; i++) {
          if (shape.id === draggingPoint.shapeId && i === draggingPoint.pointIndex) continue;
          const p = shape.points[i];
          const dist = Math.sqrt(Math.pow(clampedL - p.x, 2) + Math.pow(clampedH - p.y, 2));
          if (dist < tolerance) {
            finalL = p.x;
            finalH = p.y;
            break;
          }
        }
      }

      const nextShapes = shapes.map(shape => {
        if (shape.id === draggingPoint.shapeId) {
          const newPoints = [...shape.points];
          newPoints[draggingPoint.pointIndex] = { x: finalL, y: finalH, target: sourceToTarget(finalL, finalH) };
          return { ...shape, points: newPoints };
        }
        return shape;
      });
      setShapes(nextShapes);
    }
  };

  const handleMouseUp = () => {
    if (draggingPoint) { pushToHistory(shapes); setDraggingPoint(null); }
    setIsPanning(false);
  };

  const handleClosePolygon = () => {
    const nextShapes = shapes.map(s => s.isDraft ? { ...s, isDraft: false } : s);
    setShapes(nextShapes); pushToHistory(nextShapes); setCurrentShapePoints([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    const sheetW = sourceW * basePxPerCm;
    const sheetH = sourceH * basePxPerCm;
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 20 / scale;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, sheetW, sheetH);
    ctx.shadowBlur = 0;
    if (bgImage) { ctx.globalAlpha = bgOpacity; ctx.drawImage(bgImage, 0, 0, sheetW, sheetH); ctx.globalAlpha = 1.0; }
    ctx.lineWidth = 0.5 / scale;
    ctx.strokeStyle = '#e2e8f0';
    for (let i = 0; i <= sourceW; i++) { ctx.beginPath(); ctx.moveTo(i * basePxPerCm, 0); ctx.lineTo(i * basePxPerCm, sheetH); ctx.stroke(); }
    for (let i = 0; i <= sourceH; i++) { ctx.beginPath(); ctx.moveTo(0, i * basePxPerCm); ctx.lineTo(sheetW, i * basePxPerCm); ctx.stroke(); }
    const toPx = (l, h) => ({ x: l * basePxPerCm, y: sheetH - (h * basePxPerCm) });
    shapes.forEach(shape => {
      if (!shape.visible) return;
      const isSelected = shape.id === selectedShapeId;
      ctx.lineWidth = (isSelected ? 4 : 2) / scale;
      ctx.strokeStyle = shape.color; ctx.fillStyle = shape.color;
      if (shape.points.length === 1) {
        const p = toPx(shape.points[0].x, shape.points[0].y);
        ctx.beginPath(); ctx.arc(p.x, p.y, (isSelected ? 7 : 5) / scale, 0, Math.PI * 2); ctx.fill();
        if (isSelected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2/scale; ctx.stroke(); }
      } else {
        ctx.beginPath();
        const start = toPx(shape.points[0].x, shape.points[0].y);
        ctx.moveTo(start.x, start.y);
        shape.points.forEach(pt => { const pxPt = toPx(pt.x, pt.y); ctx.lineTo(pxPt.x, pxPt.y); });
        if (shape.type === 'Area') { if (!shape.isDraft) ctx.closePath(); ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1.0; }
        ctx.stroke();
        if (isSelected) {
          shape.points.forEach(pt => {
            const p = toPx(pt.x, pt.y);
            ctx.beginPath(); ctx.arc(p.x, p.y, 4/scale, 0, Math.PI * 2);
            ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = shape.color; ctx.stroke();
          });
        }
      }
    });
    ctx.restore();
  }, [shapes, offset, scale, sourceW, sourceH, bgImage, bgOpacity, selectedShapeId]);

  const activeShape = shapes.find(s => s.id === selectedShapeId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-30">
        <div className="p-5 border-b border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
            <Target size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none mb-1">Mapper Pro</h1>
            <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Precisione Muro</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          <section className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
            <h2 className="text-[10px] font-bold text-blue-400 uppercase mb-3 flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> 1. Dimensioni Foglio
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                 <p className="text-[8px] text-slate-500 uppercase font-bold pl-1">Base (cm)</p>
                 <input type="number" value={sourceW} onChange={(e) => setSourceW(Number(e.target.value))} className="no-spinner w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs text-center focus:border-blue-500 outline-none transition"/>
              </div>
              <div className="space-y-1">
                 <p className="text-[8px] text-slate-500 uppercase font-bold pl-1">Altezza (cm)</p>
                 <input type="number" value={sourceH} onChange={(e) => setSourceH(Number(e.target.value))} className="no-spinner w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs text-center focus:border-blue-500 outline-none transition"/>
              </div>
            </div>
            <button onClick={() => fileInputRef.current.click()} className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[10px] rounded-lg border border-blue-500/30 border-dashed transition">
              {bgImage ? "Cambia Immagine" : "+ Carica Foto Disegno"}
            </button>
            <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const r = new FileReader();
                r.onload = (ev) => { const img = new Image(); img.onload = () => setBgImage(img); img.src = ev.target.result; };
                r.readAsDataURL(file);
              }
            }}/>
          </section>

          <section className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
            <h2 className="text-[10px] font-bold text-emerald-400 uppercase mb-3 flex items-center gap-2">
              <Ruler className="w-3.5 h-3.5" /> 2. Spazio Reale (Muro)
            </h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-[8px] text-emerald-500/60 uppercase font-black pl-1">Larghezza Totale (cm)</p>
                <input type="number" value={targetW} onChange={(e) => setTargetW(Number(e.target.value))} className="no-spinner w-full bg-slate-950 border border-emerald-500/30 rounded-lg p-2.5 text-xl font-mono text-emerald-400 outline-none"/>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                   <p className="text-[8px] text-emerald-500/60 uppercase font-black pl-1">Altezza Totale (cm)</p>
                   <input type="number" value={targetH} readOnly={lockRatio} onChange={(e) => setTargetH(Number(e.target.value))} className={`no-spinner w-full bg-slate-950 border border-emerald-500/30 rounded-lg p-2.5 text-xl font-mono text-emerald-400 outline-none ${lockRatio ? 'opacity-50' : ''}`}/>
                </div>
                <button onClick={() => setLockRatio(!lockRatio)} className={`p-3 rounded-lg border transition mb-0.5 ${lockRatio ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'}`}>
                   {lockRatio ? <Lock size={16}/> : <Unlock size={16}/>}
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-4 gap-1 bg-slate-800 p-1 rounded-xl shadow-inner">
            {[ 
              {id:'pan', icon:Hand, label:'Sposta'},
              {id:'point', icon:Target, label:'Punto'}, 
              {id:'line', icon:Ruler, label:'Linea'}, 
              {id:'polygon', icon:Grid3X3, label:'Area'} 
            ].map(t => (
              <button key={t.id} onClick={() => { setTool(t.id); setCurrentShapePoints([]); }} className={`py-2 rounded-lg flex flex-col items-center transition-all ${tool === t.id ? 'bg-slate-700 text-emerald-400 shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>
                <t.icon size={14}/>
                <span className="text-[8px] font-black uppercase mt-1">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="bg-slate-800/20 border border-slate-700/50 p-2 rounded-lg flex items-start gap-2">
            <Info size={12} className="text-blue-400 mt-0.5 shrink-0"/>
            <p className="text-[8px] text-slate-500 leading-relaxed italic">
              <strong>Suggerimento:</strong> Tieni premuto <span className="text-slate-300 font-bold">CTRL</span> e trascina un punto qualsiasi per spostarlo velocemente.
            </p>
          </div>

          {tool === 'polygon' && currentShapePoints.length > 0 && (
            <button onClick={handleClosePolygon} className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-2 shadow-lg transition-all">
              <CheckCircle2 size={16}/> CHIUDI AREA
            </button>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <History size={14}/> Storia
              </h3>
              <div className="flex gap-2">
                <button onClick={undo} disabled={historyStep === 0} className="text-[9px] font-bold text-slate-400 hover:text-emerald-400 disabled:opacity-20 transition">UNDO</button>
                <button onClick={redo} disabled={historyStep === history.length - 1} className="text-[9px] font-bold text-slate-400 hover:text-emerald-400 disabled:opacity-20 transition">REDO</button>
              </div>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {shapes.map((s) => (
                <div key={s.id} onClick={() => setSelectedShapeId(s.id)} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${selectedShapeId === s.id ? 'bg-emerald-500/10 border-emerald-500/50 shadow-lg' : 'bg-slate-800/30 border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-3">
                     <div className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></div>
                     <div className="flex flex-col">
                        <span className={`text-[9px] font-bold uppercase ${selectedShapeId === s.id ? 'text-emerald-400' : 'text-slate-300'}`}>{s.type}</span>
                        {s.points.length === 1 && <span className="text-[7px] text-slate-500">{s.points[0].target.L}, {s.points[0].target.H}</span>}
                     </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={(e) => { e.stopPropagation(); const next = shapes.map(x => x.id === s.id ? {...x, visible: !x.visible} : x); setShapes(next); pushToHistory(next); }} className="p-1 hover:text-white">{s.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button>
                     <button onClick={(e) => { e.stopPropagation(); const next = shapes.filter(x => x.id !== s.id); setShapes(next); pushToHistory(next); if(selectedShapeId===s.id) setSelectedShapeId(null); }} className="p-1 hover:text-red-400"><Trash2 size={12}/></button>
                  </div>
                </div>
              )).reverse()}
            </div>
          </div>

          {activeShape && (
            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between text-emerald-400 text-[9px] font-black uppercase border-b border-slate-800 pb-2 mb-2">
                <span className="flex items-center gap-1.5"><Info size={12}/> Posizioni Muro</span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                {activeShape.points.map((p, i) => (
                  <div key={i} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/50 space-y-2">
                    <p className="text-[8px] font-mono text-slate-600 uppercase">Punto {i+1}</p>
                    <div className="flex flex-col gap-1.5">
                       <div className="flex items-center gap-2 text-[10px]">
                          <ArrowRight size={12} className="text-emerald-500"/>
                          <span className="text-slate-400">Destra:</span>
                          <span className="font-mono font-bold text-white text-sm">{p.target.L} cm</span>
                       </div>
                       <div className="flex items-center gap-2 text-[10px]">
                          <ArrowUp size={12} className="text-emerald-500"/>
                          <span className="text-slate-400">Alto:</span>
                          <span className="font-mono font-bold text-white text-sm">{p.target.H} cm</span>
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <button className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-emerald-400 text-[10px] font-black uppercase transition-colors tracking-widest py-2">
            <Download size={14} /> Esporta Dati
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col bg-[#0a0f1a]" ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeaveCanvas}>
        {/* HUD COORDINATE */}
        <div className={`absolute top-8 left-1/2 -translate-x-1/2 flex items-center transition-all duration-500 ease-in-out bg-slate-900/90 backdrop-blur-lg border border-emerald-500/20 shadow-2xl z-20 pointer-events-none ring-1 ring-white/5 ${isHudStandby ? 'px-6 py-2.5 rounded-full gap-4 scale-95 opacity-80' : 'px-12 py-5 rounded-[2.5rem] gap-8'}`}>
           <div className="flex flex-col items-center">
             {!isHudStandby && <div className="flex items-center gap-1.5 mb-1.5"><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Destra</span></div>}
             <div className={`font-mono font-black text-white flex items-baseline transition-all duration-500 ${isHudStandby ? 'text-xl' : 'text-4xl'}`}>
                {cursorPos.L}<span className={`text-emerald-500/50 ml-1 font-bold ${isHudStandby ? 'text-[8px]' : 'text-xs'}`}>cm</span>
             </div>
           </div>
           <div className={`bg-slate-800/50 transition-all duration-500 ${isHudStandby ? 'w-px h-6' : 'w-px h-14'}`}></div>
           <div className="flex flex-col items-center">
             {!isHudStandby && <div className="flex items-center gap-1.5 mb-1.5"><span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Altezza</span></div>}
             <div className={`font-mono font-black text-white flex items-baseline transition-all duration-500 ${isHudStandby ? 'text-xl' : 'text-4xl'}`}>
                {cursorPos.H}<span className={`text-emerald-500/50 ml-1 font-bold ${isHudStandby ? 'text-[8px]' : 'text-xs'}`}>cm</span>
             </div>
           </div>
        </div>

        <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-20 w-32">
          <button 
            onClick={centerCanvas} 
            className="w-full h-[52px] bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 rounded-2xl shadow-2xl text-emerald-400 transition-all active:scale-95 group flex items-center justify-center"
            title="Riporta al centro"
          >
            <Maximize size={20}/>
          </button>
          
          <div className="w-full bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-3 flex flex-col items-center justify-center shadow-2xl shadow-emerald-500/10 backdrop-blur-md">
             <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Zoom</span>
             <div className="flex items-baseline gap-1">
                <span className="text-2xl font-mono font-black text-white leading-none">{Math.round(scale * 100)}</span>
                <span className="text-xs font-bold text-emerald-400/60">%</span>
             </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`w-full h-full block ${isPanning || draggingPoint ? 'cursor-grabbing' : tool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
        />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .no-spinner::-webkit-inner-spin-button, .no-spinner::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
};

export default App;