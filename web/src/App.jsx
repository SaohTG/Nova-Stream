import React, { useEffect, useState } from 'react'
import api from './api'
import Login from './pages/Login'
import WizardXtream from './pages/WizardXtream'
import Home from './pages/Home'

export default function App(){
  const [authed, setAuthed] = useState(false)
  const [linked, setLinked] = useState(false)
  const [userId, setUserId] = useState(null)

  async function tryRefresh(){
    try{ await api.post('/auth/refresh'); setAuthed(true); }catch{}
  }
  useEffect(()=>{ tryRefresh() }, [])

  useEffect(()=>{
    if(authed){
      // In a real app, decode access token or fetch /user/me to get user id
      setUserId('me') // MVP placeholder
      // probe if linked
      api.get('/user/xtream-credentials', { params: { user_id: 'me' }})
        .then(()=>setLinked(true)).catch(()=>setLinked(false))
    }
  }, [authed])

  if(!authed) return <Login onLogged={()=>setAuthed(true)}/>
  if(!linked) return <WizardXtream userId={'me'} onLinked={()=>setLinked(true)}/>
  return <Home userId={'me'}/>
}
