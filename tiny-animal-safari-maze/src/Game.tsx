import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

type DifficultyKey = 'easy' | 'medium' | 'hard' | 'pro'
type AnimalKey = 'chipmunk' | 'frog' | 'hedgehog' | 'hummingbird'
type PredatorType = 'hawk' | 'fox' | 'snake' | 'badger'
type Tile = 0 | 1 | 2 | 3 | 4 // 0 wall,1 path,2 grass,3 water,4 artifact slot

const TILE = { WALL:0 as Tile, PATH:1 as Tile, GRASS:2 as Tile, WATER:3 as Tile, ART:4 as Tile }

const DIFFICULTY: Record<DifficultyKey, { mazeW:number; mazeH:number; playerSpeed:number; predatorSpeed:number; frightenedDuration:number; lives:number; predatorsActive:number; extraPredatorSeedPct?:number; }> = {
  easy:   { mazeW: 41, mazeH: 37, playerSpeed: 6.2, predatorSpeed: 5.2, frightenedDuration: 8.0, lives: 5, predatorsActive: 3 },
  medium: { mazeW: 45, mazeH: 39, playerSpeed: 6.2, predatorSpeed: 6.2, frightenedDuration: 6.0, lives: 4, predatorsActive: 4 },
  hard:   { mazeW: 47, mazeH: 41, playerSpeed: 6.5, predatorSpeed: 6.8, frightenedDuration: 4.0, lives: 3, predatorsActive: 4, extraPredatorSeedPct: 0.5 },
  pro:    { mazeW: 51, mazeH: 45, playerSpeed: 6.7, predatorSpeed: 7.2, frightenedDuration: 2.5, lives: 3, predatorsActive: 4, extraPredatorSeedPct: 0.7 },
}

const ANIMALS: Record<AnimalKey, { label:string; cooldown:number; duration:number; }> = {
  chipmunk:    { label: 'Chipmunk', cooldown: 20, duration: 1.5 },
  frog:        { label: 'Frog', cooldown: 18, duration: 0.8 },
  hedgehog:    { label: 'Hedgehog', cooldown: 22, duration: 1.2 },
  hummingbird: { label: 'Hummingbird', cooldown: 16, duration: 1.2 },
}

const COLORS = {
  bg: '#0b1022',
  wall: '#1d2763',
  path: '#10162d',
  grass: '#1b3a2f',
  water: '#0b2d3a',
  seed: '#ffd28c',
  artifact: '#9dd7ff',
  player: '#ffe066',
  predators: {
    hawk: '#ff5d5d',
    fox: '#ff9b54',
    snake: '#81f7a0',
    badger: '#c1b7ff',
    frightened: '#5db1ff',
  },
}

const clamp = (v:number,a:number,b:number)=> Math.max(a, Math.min(b,v))

function isPassable(tile: Tile) {
  return tile === TILE.PATH || tile === TILE.GRASS || tile === TILE.WATER || tile === TILE.ART
}
function tileSpeedMod(tile: Tile, animal: AnimalKey, abilityActive: boolean) {
  if (abilityActive) return 1.0
  if (animal === 'frog' && tile === TILE.WATER) return 1.0
  switch (tile) { case TILE.GRASS: return 0.8; case TILE.WATER: return 0.65; default: return 1.0 }
}
function greedyStep(grid: Tile[][], from:{x:number;y:number}, target:{x:number;y:number}, frightened=false) {
  const options = [[1,0],[-1,0],[0,1],[0,-1]] as const
  let best = { dx:0, dy:0, score: frightened ? -Infinity : Infinity }
  for (const [dx,dy] of options) {
    const nx = Math.round(from.x+dx), ny = Math.round(from.y+dy)
    const t = grid[ny]?.[nx]
    if (t===undefined || !isPassable(t)) continue
    const d = Math.hypot(target.x - nx, target.y - ny)
    const s = frightened ? d : -d
    if (s > best.score) best = { dx, dy, score: s }
  }
  return { dx: best.dx, dy: best.dy }
}

// Maze generation (seeded)
function mulberry32(a:number){return function(){var t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15, t|1);t^=t+Math.imul(t^t>>>7, t|61);return ((t^t>>>14)>>>0)/4294967296}}
function generateMaze(mazeW:number, mazeH:number, seed:number){
  const rnd = mulberry32(seed>>>0)
  const W = mazeW%2===0?mazeW-1:mazeW, H = mazeH%2===0?mazeH-1:mazeH
  const grid: Tile[][] = Array.from({length:H},()=>Array.from({length:W},()=>TILE.WALL))
  const dirs = [[0,-2],[2,0],[0,2],[-2,0]] as const
  const stack:[number,number][] = []
  const startX=1, startY=1; grid[startY][startX]=TILE.PATH; stack.push([startX,startY])
  while(stack.length){
    const [cx,cy] = stack[stack.length-1]
    const shuffled = [...dirs].sort(()=>rnd()-0.5)
    let carved=false
    for(const [dx,dy] of shuffled){
      const nx=cx+dx, ny=cy+dy
      if(nx>0 && ny>0 && nx<W-1 && ny<H-1 && grid[ny][nx]===TILE.WALL){
        grid[cy+dy/2][cx+dx/2]=TILE.PATH; grid[ny][nx]=TILE.PATH; stack.push([nx,ny]); carved=true; break
      }
    }
    if(!carved) stack.pop()
  }
  for(let y=1;y<H-1;y++){ for(let x=1;x<W-1;x++){ if(grid[y][x]===TILE.PATH){ const r=rnd(); if(r<0.06) grid[y][x]=TILE.GRASS; else if(r<0.10) grid[y][x]=TILE.WATER; } } }
  const candidates:[number,number][]= []
  for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++) if(grid[y][x]!==TILE.WALL) candidates.push([x,y])
  function pickNear(tx:number,ty:number){ let best:[number,number]=[1,1],bd=Infinity; for(const [x,y] of candidates){ const d=Math.hypot(x-tx,y-ty); if(d<bd){bd=d;best=[x,y]} } return best }
  const quads = [[Math.floor(W*0.25),Math.floor(H*0.25)],[Math.floor(W*0.75),Math.floor(H*0.25)],[Math.floor(W*0.25),Math.floor(H*0.75)],[Math.floor(W*0.75),Math.floor(H*0.75)]]
  for(const [qx,qy] of quads){ const [ax,ay]=pickNear(qx,qy); grid[ay][ax]=TILE.ART }
  const midY = Math.floor(H/2); grid[midY][0]=TILE.PATH; grid[midY][W-1]=TILE.PATH
  return {grid,W,H}
}

// Lightweight sound using WebAudio (no assets)
function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)
  function ensure(){ if(!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)() }
  function beep(freq=880, dur=0.06, type: OscillatorType='sine', gain=0.03){
    ensure(); const ctx = ctxRef.current!; const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = type; o.frequency.value = freq; g.gain.value = gain; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur)
  }
  return { beep }
}

type GameProps = { difficulty: DifficultyKey; animal: AnimalKey; seed: number; onGameOver?: ()=>void }
export default forwardRef(function Game({difficulty, animal, seed, onGameOver}: GameProps, ref){
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(DIFFICULTY[difficulty].lives)
  const keysRef = useRef<Record<string, boolean>>({})
  const { beep } = useSound()

  useEffect(()=>{ setLives(DIFFICULTY[difficulty].lives); setScore(0) }, [difficulty, seed])

  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{ keysRef.current[e.key.toLowerCase()]=true; if(e.key===' ') e.preventDefault() }
    const up=(e:KeyboardEvent)=>{ keysRef.current[e.key.toLowerCase()]=false }
    window.addEventListener('keydown',down); window.addEventListener('keyup',up)
    return ()=>{ window.removeEventListener('keydown',down); window.removeEventListener('keyup',up) }
  }, [])

  useImperativeHandle(ref, ()=>({ restart(){ startGame() } }))

  const gameRef = useRef<any>(null)

  useEffect(()=>{ startGame(); return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current) } }, [difficulty, animal, seed])

  function startGame(){
    const cfg = DIFFICULTY[difficulty]
    const { grid, W, H } = generateMaze(cfg.mazeW, cfg.mazeH, seed)
    const seeds:boolean[][] = Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=> isPassable(grid[y][x])))
    const artifacts:{x:number;y:number;taken:boolean}[] = []
    for(let y=0;y<H;y++) for(let x=0;x<W;x++) if(grid[y][x]===TILE.ART){ artifacts.push({x,y,taken:false}); seeds[y][x]=false }
    let px = Math.floor(W/2), py = H-3; while(!isPassable(grid[py][px])) py--
    const denX = Math.floor(W/2), denY = Math.floor(H/2)
    const predators:any[] = []
    for(let i=0;i<cfg.predatorsActive;i++) predators.push(makePred(i))
    function makePred(i:number){ const types:PredatorType[]=['hawk','fox','snake','badger']; const type=types[i%types.length]; return { type, x: denX + (i%2===0?1:-1), y: denY + (i<2?0:1), dir:{x:0,y:0}, frightened:0 } }

    const state = {
      grid,W,H,seeds,totalSeeds:seeds.flat().filter(Boolean).length, artifacts,
      player:{ x:px,y:py,dir:{x:0,y:0},nextDir:{x:0,y:0}, cooldown:0, ability:0, shield: animal==='hedgehog'?1:0 },
      predators, frightened:0, seedCollected:0, extraSpawned:false, last: performance.now()
    }
    gameRef.current = state
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }

  function endLife(){
    const st = gameRef.current; if(!st) return
    setLives(v=>v-1)
    // reset positions
    let px = Math.floor(st.W/2), py = st.H-3; while(!isPassable(st.grid[py][px])) py--
    st.player.x = px; st.player.y = py; st.player.dir={x:0,y:0}; st.player.nextDir={x:0,y:0}; st.player.cooldown=0; st.player.ability=0
    const denX = Math.floor(st.W/2), denY = Math.floor(st.H/2)
    st.predators.forEach((p:any,i:number)=>{ p.x=denX+(i%2===0?1:-1); p.y=denY+(i<2?0:1); p.dir={x:0,y:0}; p.frightened=0 })
    st.frightened=0
    beep(180,0.12,'triangle',0.04)
  }

  useEffect(()=>{
    if(lives<=0){
      if(rafRef.current) cancelAnimationFrame(rafRef.current)
      saveScore(score)
      onGameOver && onGameOver()
      alert('Game over! Your score: '+score)
    }
  }, [lives])

  function loop(now:number){
    const st = gameRef.current; if(!st) return
    const dt = Math.min(0.05, (now - st.last)/1000); st.last = now
    handleInput(st)
    updatePlayer(st, dt)
    updatePredators(st, dt)
    handleCollisions(st)
    draw(st)
    if (st.seedCollected >= st.totalSeeds){
      setScore(s=>s+1000); beep(1200,0.2,'sawtooth',0.03)
      startGame(); return
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function handleInput(st:any){
    const k = keysRef.current
    let dx=0, dy=0
    if (k['arrowleft']||k['a']) dx=-1; else if (k['arrowright']||k['d']) dx=1
    if (k['arrowup']||k['w']) dy=-1; else if (k['arrowdown']||k['s']) dy=1
    if (dx!==0 || dy!==0) st.player.nextDir = {x:dx,y:dy}
    if ((k[' ']||k['space']) && st.player.cooldown<=0 && st.player.ability<=0){
      st.player.ability = ANIMALS[animal].duration; st.player.cooldown = ANIMALS[animal].cooldown
      beep(880,0.08,'square',0.03)
    }
  }

  function tileAt(st:any,x:number,y:number):Tile|undefined{ return st.grid[Math.round(y)]?.[Math.round(x)] }
  function passableAt(st:any,x:number,y:number){ const t=tileAt(st,x,y); return t!==undefined && isPassable(t as Tile) }

  function updatePlayer(st:any, dt:number){
    const p = st.player
    if (p.cooldown>0) p.cooldown -= dt; if (p.ability>0) p.ability -= dt; if (st.frightened>0) st.frightened -= dt
    const t = (tileAt(st,p.x,p.y) ?? TILE.PATH) as Tile
    const speedMod = tileSpeedMod(t, animal, p.ability>0) * (animal==='chipmunk'?1.05:1.0)
    const base = DIFFICULTY[difficulty].playerSpeed * (p.ability>0 && animal==='chipmunk'?1.4:1.0)
    const s = base * speedMod
    const nx = Math.round(p.x + p.nextDir.x), ny = Math.round(p.y + p.nextDir.y)
    if ((p.nextDir.x||p.nextDir.y) && passableAt(st,nx,ny)) p.dir = {...p.nextDir}
    let tx = p.x + p.dir.x*s*dt, ty = p.y + p.dir.y*s*dt
    const midY = Math.floor(st.H/2)
    if (Math.round(p.y)===midY && (Math.round(tx) < 0)) tx = st.W-1
    if (Math.round(p.y)===midY && (Math.round(tx) > st.W-1)) tx = 0
    if (passableAt(st,tx,ty)) { p.x=tx; p.y=ty } else { p.dir={x:0,y:0} }

    const cx=Math.round(p.x), cy=Math.round(p.y)
    if (st.seeds[cy]?.[cx]){ st.seeds[cy][cx]=false; st.seedCollected++; setScore(s=>s+10); beep(760,0.03,'sine',0.02)
      const cfg=DIFFICULTY[difficulty]; const pct = st.seedCollected/st.totalSeeds
      if(!st.extraSpawned && cfg.extraPredatorSeedPct && pct >= cfg.extraPredatorSeedPct){ st.predators.push({type:'fox',x:Math.floor(st.W/2),y:Math.floor(st.H/2),dir:{x:0,y:0},frightened:0}); st.extraSpawned=true }
    }
    for(const a of st.artifacts){ if(!a.taken && a.x===cx && a.y===cy){ a.taken=true; setScore(s=>s+50); st.frightened = DIFFICULTY[difficulty].frightenedDuration; for(const pr of st.predators) pr.frightened = st.frightened; beep(1100,0.12,'triangle',0.035) } }
  }

  function updatePredators(st:any, dt:number){
    const cfg = DIFFICULTY[difficulty]
    for(const pred of st.predators){
      const frightened = st.frightened>0, fMul = frightened ? 0.7 : 1.0
      const s = cfg.predatorSpeed * fMul
      let target = { x: st.player.x, y: st.player.y }
      if (pred.type==='hawk'){ target = { x: st.player.x + st.player.dir.x*4, y: st.player.y + st.player.dir.y*4 } }
      else if (pred.type==='snake'){ const d=Math.hypot(st.player.x-pred.x, st.player.y-pred.y); if (d>6){ if(Math.random()<0.04) pred.dir = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}][Math.floor(Math.random()*4)]; target = {x:pred.x+pred.dir.x, y:pred.y+pred.dir.y} } }
      else if (pred.type==='badger'){ const remaining=st.artifacts.filter((a:any)=>!a.taken); if(remaining.length){ let best=remaining[0],bd=Infinity; for(const a of remaining){ const d=Math.hypot(a.x-pred.x,a.y-pred.y); if(d<bd){bd=d;best=a} } target = {x:best.x, y:best.y} } }
      const step = greedyStep(st.grid,{x:pred.x,y:pred.y},target,frightened)
      const nx = pred.x + step.dx*s*dt, ny = pred.y + step.dy*s*dt
      if (passableAt(st,nx,ny)) { pred.x=nx; pred.y=ny; pred.dir=step }
      else {
        const options=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]
        while(options.length){ const o=options.splice(Math.floor(Math.random()*options.length),1)[0]; const tx=pred.x+o.x*s*dt, ty=pred.y+o.y*s*dt; if(passableAt(st,tx,ty)){ pred.x=tx; pred.y=ty; pred.dir=o; break } }
      }
      if (pred.frightened>0) pred.frightened -= dt
    }
  }

  function handleCollisions(st:any){
    const p = st.player
    for(const pred of st.predators){
      const d = Math.hypot(pred.x - p.x, pred.y - p.y)
      if (d < 0.45){
        const hedgehogReflect = (p.ability>0 && animal==='hedgehog')
        if (st.frightened>0 || hedgehogReflect){
          pred.x += (pred.x - p.x)*1.2; pred.y += (pred.y - p.y)*1.2; setScore(s=>s+200); pred.frightened=0.5; beep(980,0.08,'square',0.025)
        } else if (p.shield>0 && animal==='hedgehog'){ p.shield -= 1; pred.x += (pred.x - p.x)*1.2; pred.y += (pred.y - p.y)*1.2; }
        else { endLife(); break }
      }
    }
  }

  function draw(st:any){
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const TILE_PX = 18
    const w = st.W*TILE_PX, h = st.H*TILE_PX
    if (canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h }
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0,0,w,h)
    for(let y=0;y<st.H;y++){ for(let x=0;x<st.W;x++){ const t:Tile = st.grid[y][x]; const px=x*TILE_PX, py=y*TILE_PX; switch(t){ case TILE.WALL: ctx.fillStyle=COLORS.wall; break; case TILE.PATH: ctx.fillStyle=COLORS.path; break; case TILE.GRASS: ctx.fillStyle=COLORS.grass; break; case TILE.WATER: ctx.fillStyle=COLORS.water; break; case TILE.ART: ctx.fillStyle=COLORS.path; break; } ctx.fillRect(px,py,TILE_PX,TILE_PX); if (st.seeds[y][x]){ ctx.fillStyle=COLORS.seed; ctx.beginPath(); ctx.arc(px+TILE_PX/2, py+TILE_PX/2, 2.2, 0, Math.PI*2); ctx.fill() } } }
    for(const a of st.artifacts){ if(!a.taken){ const px=a.x*TILE_PX+TILE_PX/2, py=a.y*TILE_PX+TILE_PX/2; ctx.fillStyle=COLORS.artifact; ctx.beginPath(); ctx.arc(px,py,5.0,0,Math.PI*2); ctx.fill() } }
    const drawAgent=(x:number,y:number,color:string,pulse=false)=>{ const px=x*TILE_PX+TILE_PX/2, py=y*TILE_PX+TILE_PX/2; ctx.fillStyle=color; ctx.beginPath(); ctx.arc(px,py,6.5+(pulse?1.0:0),0,Math.PI*2); ctx.fill() }
    drawAgent(st.player.x, st.player.y, COLORS.player, st.player.ability>0)
    for(const pred of st.predators){ const color = st.frightened>0 ? COLORS.predators.frightened : (COLORS.predators as any)[pred.type] || '#fff'; drawAgent(pred.x, pred.y, color, pred.frightened>0) }
    // HUD bar
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,w,22); ctx.fillStyle='#fff'; ctx.font='bold 13px ui-sans-serif, system-ui';
    const cd = Math.max(0, gameRef.current?.player.cooldown ?? 0).toFixed(1)
    ctx.fillText(`Score: ${score}`, 8, 15); ctx.fillText(`Lives: ${lives}`, 120, 15); ctx.fillText(`Ability CD: ${cd}s`, 200, 15)
    const rem = (st.totalSeeds - st.seedCollected); ctx.fillText(`Seeds left: ${rem}`, 340, 15)
  }

  // Touch controls
  const overlayRef = useRef<HTMLDivElement | null>(null)
  useEffect(()=>{
    const overlay = overlayRef.current; if(!overlay) return
    function press(key:string){ keysRef.current[key] = true; setTimeout(()=>{ keysRef.current[key] = false }, 80) }
    const map:Record<string, string> = {up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright',ability:' '}
    const handler=(e:any)=>{ const id=(e.target as HTMLElement).dataset.id as string|undefined; if(!id) return; e.preventDefault(); press(map[id]) }
    overlay.addEventListener('pointerdown', handler)
    return ()=> overlay.removeEventListener('pointerdown', handler)
  }, [])

  return (
    <div className="mobileOverlay">
      <div className="canvasWrap">
        <canvas ref={canvasRef} />
      </div>
      <div ref={overlayRef}>
        <div className="dpad">
          <span></span><button data-id="up">▲</button><span></span>
          <button data-id="left">◀</button><span></span><button data-id="right">▶</button>
          <span></span><button data-id="down">▼</button><span></span>
        </div>
        <button className="abilityBtn" data-id="ability">ABILITY</button>
      </div>
    </div>
  )
})

// Simple local leaderboard
type Entry = { name:string; score:number; date:string }
function saveScore(score:number){
  try{
    const name = (typeof window !== 'undefined') ? (window.prompt?.('Enter initials for leaderboard (3 letters):','YOU') || 'YOU').slice(0,3).toUpperCase() : 'YOU'
    const entry:Entry = { name, score, date: new Date().toISOString() }
    const key = 'tas-leaderboard'
    const arr:Entry[] = JSON.parse(localStorage.getItem(key) || '[]')
    arr.push(entry); arr.sort((a,b)=>b.score-a.score); const top = arr.slice(0,10)
    localStorage.setItem(key, JSON.stringify(top))
  }catch(e){ /* ignore */ }
}
