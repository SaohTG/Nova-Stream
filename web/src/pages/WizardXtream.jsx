import React, { useState } from 'react'
import api from '../api'

export default function WizardXtream({ userId, onLinked }){
  const [host,setHost]=useState('http://example.com')
  const [port,setPort]=useState('')
  const [username,setUsername]=useState('user')
  const [password,setPassword]=useState('pass')
  const [status,setStatus]=useState('idle')
  const [msg,setMsg]=useState('')

  async function test(){
    setStatus('testing'); setMsg('')
    try{
      const { data } = await api.post('/xtream/test', { host, port: port||undefined, username, password })
      setMsg('Connexion OK'); setStatus('ok')
    }catch(e){ setMsg('Échec connexion'); setStatus('error') }
  }
  async function link(){
    setStatus('linking'); setMsg('')
    try{
      await api.post('/user/link-xtream', { user_id: userId, host, port: port?Number(port):null, username, password })
      onLinked()
    }catch(e){ setMsg('Erreur de liaison'); setStatus('idle') }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="card w-full max-w-lg p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Lier votre compte Xtream</h1>
        <input className="input" placeholder="Host (ex: http://mon-serveur.com)" value={host} onChange={e=>setHost(e.target.value)} />
        <input className="input" placeholder="Port (optionnel)" value={port} onChange={e=>setPort(e.target.value)} />
        <input className="input" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
        <input className="input" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn" onClick={test}>Tester</button>
          <button className="btn" onClick={link} disabled={status!=='ok'}>Lier</button>
        </div>
        <div className="text-sm">{msg}</div>
      </div>
    </div>
  )
}
