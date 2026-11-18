import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "kysely";
import { publish, createToken } from "@floot/realtime";
import { db } from "./db";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const round = /^T(0[1-9]|[1-3][0-9]|40)$/;
const individual = /^I0(0[1-9]|[1-8][0-9]|90)$/;
const chair = /^T(0[1-9]|[1-3][0-9]|40)-[A-D]$/;
const validRoom = (room: string) => room === "floor8" || uuid.test(room);
const channel = (room: string) => "seats:" + room;
const digest = (value: string) => createHash("sha256").update(value).digest();
const headers = { "Access-Control-Allow-Origin":"*", "Cache-Control":"no-store", "Content-Type":"application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
type Row = {source:string; target:string; value:string; at:number|string; simulated:boolean; id:string};
const normalize = (r:Row) => ({...r, at:Number(r.at), value:r.source === "ble" ? Number(r.value) : r.value});
const projection = sql.raw('source, target, reading as value, extract(epoch from observed_at)*1000 as at, simulated, event_id as id');

export async function snapshot(request: Request) {
  const params = new URL(request.url).searchParams;
  const room = params.get("room") || "floor8";
  if (!validRoom(room)) return json({error:"Invalid floor session."},400);
  const result = await sql<Row>`select ${projection} from seat_observation where room=${room} and observed_at > now() - interval '24 hours' order by observed_at`.execute(db);
  let socket;
  if (params.get("listen") === "1") {
    try {
      const token = await createToken({userId:randomUUID(), channels:[channel(room)], ttlSeconds:3600});
      if (token.ok) socket = {token:token.token,url:token.wssEndpoint,channel:channel(room)};
    } catch { /* Snapshots are available during a realtime outage. */ }
  }
  return json({events:result.rows.map(normalize), now:Date.now(), socket});
}

export async function observe(request: Request) {
  const text = await request.text();
  if(text.length > 4096) return json({error:"Observation too large."},413);
  let body;
  try {body = JSON.parse(text);} catch {return json({error:"Invalid observation."},400);}
  if (!body || typeof body !== "object") return json({error:"Observation required."},400);
  const {room, source, target, value, id} = body;
  if(typeof room !== "string" || !validRoom(room) || typeof target !== "string" || typeof id !== "string" || !uuid.test(id)) return json({error:"Invalid location or observation ID."},400);
  const seat = individual.test(target) || chair.test(target);
  const device = source === "sensor" || source === "ble";
  const validTarget = source === "ble" ? ["tables","individuals"].includes(target)
    : source === "sensor" ? round.test(target) || individual.test(target)
    : (source === "qr" || source === "report") && seat;
  const validValue = source === "ble" ? Number.isInteger(value) && value>=0 && value<=10000 : ["free","occupied"].includes(value);
  if(!validTarget || !validValue) return json({error:"Invalid observation for this source."},400);
  const simulated = body.simulated === true;
  if(room === "floor8" && simulated) return json({error:"Simulations belong on the demo floor."},403);
  if(device && room === "floor8") {
    const configured = (process.env as Record<string,string|undefined>).OPENSEAT_FEED_KEY;
    if(!configured || typeof body.feedKey !== "string" || !timingSafeEqual(digest(configured),digest(body.feedKey))) return json({error:"A configured operator key is required for the live feed."},403);
  }
  let owner:string|null=null;
  if(source === "qr") {
    if(typeof body.ticket !== "string" || !uuid.test(body.ticket)) return json({error:"This browser needs a check-in ticket."},400);
    owner=digest(body.ticket).toString("hex");
  }
  const now=Date.now();
  const stamp = device && !simulated ? body.measuredAt : now;
  if(!Number.isSafeInteger(stamp) || stamp>now+5000 || stamp<now-86400000) return json({error:"The observation time must be within the last day."},400);
  const date = new Date(Math.min(stamp,now)).toISOString();
  const fields = {room, source, target, reading:String(value), event_id:id, simulated, owner_hash:owner};
  let result;
  if (source === "qr" && value === "free") {
    result = await sql<Row>`update seat_observation set reading='free', observed_at=${date}, event_id=${id}
      where room=${room} and source='qr' and target=${target} and owner_hash=${owner}
      and event_id<>${id}::uuid and reading='occupied' returning ${projection}`.execute(db);
  } else {
    result = await sql<Row>`insert into seat_observation (room,source,target,reading,event_id,simulated,owner_hash,observed_at)
      values (${fields.room},${fields.source},${fields.target},${fields.reading},${fields.event_id},${fields.simulated},${fields.owner_hash},${date})
      on conflict (room,source,target) do update set reading=excluded.reading, event_id=excluded.event_id,
      simulated=excluded.simulated, owner_hash=excluded.owner_hash, observed_at=excluded.observed_at
      where seat_observation.event_id<>excluded.event_id and seat_observation.observed_at<=excluded.observed_at
      and (excluded.source<>'qr' or seat_observation.reading='free' or seat_observation.owner_hash=excluded.owner_hash
           or seat_observation.observed_at < now()-interval '60 minutes')
      returning ${projection}`.execute(db);
  }
  if(!result.rows.length) {
    const prior=await sql<Row>`select ${projection} from seat_observation where room=${room} and source=${source} and target=${target} and event_id=${id}`.execute(db);
    if(prior.rows[0]) return json({event:normalize(prior.rows[0])});
    return json({error:source==="qr" ? "This check-in belongs to another browser or has already ended." : "A newer reading is already on the map."},409);
  }
  const event=normalize(result.rows[0]);
  try {await publish(channel(room),{event});} catch { /* The persisted observation is authoritative. */ }
  return json({event});
}
