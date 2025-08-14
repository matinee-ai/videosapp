import React, { useRef, useState } from 'react'
import Game from './Game'

type DifficultyKey = 'easy' | 'medium' | 'hard' | 'pro'
type AnimalKey = 'chipmunk' | 'frog' | 'hedgehog' | 'hummingbird'

const animalLabels: Record<AnimalKey, string> = {
  chipmunk: 'Chipmunk (dash)',
  frog: 'Frog (water hop)',
  hedgehog: 'Hedgehog (shield)',
  hummingbird: 'Hummingbird (drift)',
}

export default function App() {
  const [difficulty, setDifficulty] = useState<DifficultyKey>('easy')
  const [animal, setAnimal] = useState<AnimalKey>('chipmunk')
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random()*1e9))
  const [running, setRunning] = useState(false)
  const gameRef = useRef<{restart:()=>void}>(null)

  return (
    <div className="container">
      <h1>Tiny Animal Safari — Maze Run</h1>

      <div className="controls">
        <label>
          <div className="small">Difficulty</div>
          <select className="select" value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyKey)} disabled={running}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <label>
          <div className="small">Animal</div>
          <select className="select" value={animal} onChange={e => setAnimal(e.target.value as AnimalKey)} disabled={running}>
            {Object.entries(animalLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="button primary" onClick={() => { setSeed(Math.floor(Math.random()*1e9)); setRunning(true); }} disabled={running}>Start</button>
        <button className="button" onClick={() => { gameRef.current?.restart(); setRunning(true); }}>Restart</button>
        <button className="button" onClick={() => { setRunning(false); setSeed(Math.floor(Math.random()*1e9)); }}>Stop</button>
      </div>

      <div className="small">Controls: <kbd>WASD</kbd>/<kbd>Arrows</kbd> to move · <kbd>Space</kbd> = Ability</div>

      <Game ref={gameRef} difficulty={difficulty} animal={animal} seed={seed} onGameOver={() => setRunning(false)} />
      
      <div className="grid" style={{maxWidth: 920}}>
        <div className="card">
          <div className="small" style={{fontWeight:700, marginBottom: 6}}>Tips</div>
          <ul className="list">
            <li><span>Artifacts (blue)</span><span>Frighten predators</span></li>
            <li><span>Hedgehog</span><span>1 free bump</span></li>
            <li><span>Frog</span><span>Glides through water</span></li>
            <li><span>Chipmunk</span><span>Fast dash</span></li>
            <li><span>Hummingbird</span><span>Snappy corners</span></li>
          </ul>
        </div>
        <div className="card">
          <div className="small" style={{fontWeight:700, marginBottom: 6}}>How to run</div>
          <ul className="list">
            <li><span>Install</span><span><code>npm i</code></span></li>
            <li><span>Dev server</span><span><code>npm run dev</code></span></li>
            <li><span>Build</span><span><code>npm run build</code></span></li>
            <li><span>Preview</span><span><code>npm run preview</code></span></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
