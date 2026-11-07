/* Cloudflare Worker + D1.  Pasos:
 1) wrangler d1 create yaz-fashion   2) pega el database_id en wrangler.toml (binding = "DB")
 3) wrangler d1 execute yaz-fashion --command "CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT,ts INT); CREATE TABLE orders(id TEXT PRIMARY KEY,data TEXT,ts INT); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT,ts INT);"
 4) wrangler secret put ADMIN_PIN   5) wrangler secret put GOOGLE_ID (tu Client ID de Google Cloud)
 6) wrangler deploy   7) pon la URL del Worker en CFG.API y el Client ID en CFG.GOOGLE del HTML */
const H={"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-admin-pin","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","content-type":"application/json"};
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:H});
const get=async(env,t,id)=>{const r=await env.DB.prepare(`SELECT data FROM ${t} WHERE id=?`).bind(id).first();return r?JSON.parse(r.data):null};
const put=(env,t,o,ts)=>env.DB.prepare(`INSERT INTO ${t} VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).bind(o.id,JSON.stringify(o),ts||Date.now()).run();
export default{async fetch(r,env){
 if(r.method=="OPTIONS")return new Response(null,{headers:H});
 const u=new URL(r.url),[,t,id]=u.pathname.split("/"),adm=r.headers.get("x-admin-pin")==env.ADMIN_PIN;
 if(t=="auth"){ // login con Google: verifica el token con Google
  const{credential}=await r.json(),g=await(await fetch("https://oauth2.googleapis.com/tokeninfo?id_token="+credential)).json();
  if(g.aud!=env.GOOGLE_ID)return J({error:"token inválido"},401);
  const old=await get(env,"users",g.email)||{},us={...old,id:g.email,name:old.name||g.name,email:g.email,avatar:old.avatar||g.picture,prov:"google"};
  await put(env,"users",us);return J(us)}
 if(!["products","orders","users"].includes(t))return J({error:"not found"},404);
 if(t=="products"&&r.method=="GET"){const{results}=await env.DB.prepare("SELECT data FROM products ORDER BY ts DESC").all();return J(results.map(x=>JSON.parse(x.data)))}
 if(t=="orders"&&r.method=="POST"){const o=await r.json();await put(env,"orders",o,o.ts);return J(o)}
 if(t=="users"&&r.method=="POST"){const b=await r.json(),us={...(await get(env,"users",b.id)||{}),...b,admin:undefined};await put(env,"users",us);return J(us)} // registro y edición de "Mis datos"
 if(!adm)return J({error:"unauthorized"},401);
 if(r.method=="GET"){const{results}=await env.DB.prepare(`SELECT data FROM ${t} ORDER BY ts DESC`).all();return J(results.map(x=>JSON.parse(x.data)))}
 if(r.method=="POST"){const p=await r.json();await put(env,t,p);return J(p)}
 if(r.method=="PATCH"){const o={...await get(env,t,id),...await r.json()};await put(env,t,o);return J(o)}
 if(r.method=="DELETE"){await env.DB.prepare(`DELETE FROM ${t} WHERE id=?`).bind(id).run();return J({ok:1})}
 return J({error:"bad request"},400)}}
