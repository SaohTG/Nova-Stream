import fs from 'fs'; import path from 'path';
const src='src', dst='dist';
fs.rmSync(dst,{recursive:true,force:true});
fs.mkdirSync(dst,{recursive:true});
function copyDir(s,d){fs.mkdirSync(d,{recursive:true});for(const f of fs.readdirSync(s)){const sp=path.join(s,f), dp=path.join(d,f); const st=fs.statSync(sp); if(st.isDirectory()) copyDir(sp,dp); else fs.copyFileSync(sp,dp);}}
copyDir(src,dst);
console.log('Build complete');
