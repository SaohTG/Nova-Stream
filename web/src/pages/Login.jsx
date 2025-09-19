import React, { useState } from 'react'
import api from '../api'

export default function Login({ onLogged }){
  const [email,setEmail]=useState('test@example.com')
  const [password,setPassword]=useState('password')
  const [mode,setMode]=useState('login')
  const [err,setErr]=useState('')

  async function submit(e){
    e.preventDefault()
    setErr('')
    try{
      if(mode==='login') await api.post('/auth/login',{email,password})
      else await api.post('/auth/signup',{email,password})
      onLogged()
    }catch(e){ setErr(e.response?.data?.error||'Erreur') }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Se connecter à Nova</h1>
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
        <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mot de passe" />
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button className="btn w-full">{mode==='login'?'Connexion':'Créer le compte'}</button>
        <div className="text-sm text-white/60">
          {mode==='login' ? (
            <>Pas de compte ? <button type="button" className="underline" onClick={()=>setMode('signup')}>Inscription</button></>
          ): (
            <>Déjà inscrit ? <button type="button" className="underline" onClick={()=>setMode('login')}>Connexion</button></>
          )}
        </div>
      </form>
    </div>
  )
}
