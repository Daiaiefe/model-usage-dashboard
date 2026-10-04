export const PROVIDERS = ['codex', 'claude', 'deepseek'];
export const COLUMNS = ['id','timestamp','provider','model','input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','cost_usd','source'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function count(value, name, fallback) {
 if (value === undefined && fallback !== undefined) return fallback;
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a finite nonnegative integer.`);
 return value;
}
function amount(value, name) {
 if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite nonnegative number.`);
 return value;
}
function timestamp(value, name = 'timestamp') {
 if (typeof value !== 'string') throw new Error(`${name} requires an ISO timestamp with a timezone.`);
 const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if (!m) throw new Error(`${name} requires an ISO timestamp with a timezone.`);
 const [year,month,day,hour,minute,second] = m.slice(1,7).map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if (month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59 || (m[7]!=='Z' && (Number(m[7].slice(1,3))>23||Number(m[7].slice(4))>59)) || !Number.isFinite(Date.parse(value))) throw new Error(`${name} is not a valid calendar timestamp.`);
 return value;
}
function provider(value) {
 if (!PROVIDERS.includes(value)) throw new Error('provider must be codex, claude, or deepseek.');
 return value;
}
function string(value, name, fallback) {
 if (value===undefined && fallback!==undefined) return fallback;
 if (typeof value!=='string' || !value.trim()) throw new Error(`${name} must be nonempty text.`);
 return value;
}
function hash(text) {
 let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619); b=Math.imul(b,33)^text.charCodeAt(i);}
 return `row-${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}
function record(value,index) {
 if (!object(value)) throw new Error(`Row ${index+1} must be an object.`);
 const p=provider(value.provider), u=object(value.usage)?value.usage:null;
 let input=value.input_tokens,output=value.output_tokens,cached=value.cached_input_tokens,write=value.cache_write_input_tokens,reasoning=value.reasoning_output_tokens;
 if(u && input===undefined){
  if(p==='claude') {cached=u.cache_read_input_tokens??0;write=u.cache_creation_input_tokens??0;input=count(u.input_tokens,'usage.input_tokens')+count(cached,'cache read')+count(write,'cache write');}
  else {input=u.prompt_tokens??u.input_tokens;cached=u.prompt_cache_hit_tokens??u.input_tokens_details?.cached_tokens??0;write=0;}
  output=u.completion_tokens??u.output_tokens;
  reasoning=u.completion_tokens_details?.reasoning_tokens??u.output_tokens_details?.reasoning_tokens??0;
 }
 const result={id:value.id===undefined||value.id===null||value.id===''?null:string(value.id,'id'),timestamp:timestamp(value.timestamp),provider:p,model:string(value.model,'model'),input_tokens:count(input,'input_tokens'),cached_input_tokens:count(cached,'cached_input_tokens',0),cache_write_input_tokens:count(write,'cache_write_input_tokens',0),output_tokens:count(output,'output_tokens'),reasoning_output_tokens:count(reasoning,'reasoning_output_tokens',0),cost_usd:value.cost_usd===undefined||value.cost_usd===null?null:amount(value.cost_usd,'cost_usd'),source:string(value.source,'source','import')};
 if(result.cached_input_tokens+result.cache_write_input_tokens>result.input_tokens)throw new Error('Cache read plus cache write cannot exceed input_tokens.');
 if(result.reasoning_output_tokens>result.output_tokens)throw new Error('reasoning_output_tokens cannot exceed output_tokens.');
 if(result.id===null)result.id=hash(JSON.stringify(result));
 return result;
}
function unique(records){
 const map=new Map();
 for(const r of records){const key=`${r.provider}\0${r.id}`; const previous=map.get(key); if(previous&&JSON.stringify(previous)!==JSON.stringify(r))throw new Error(`Conflicting copy of ${r.provider} record ${r.id}.`);map.set(key,r);}
 return [...map.values()];
}
function array(value,name){if(value===undefined)return [];if(!Array.isArray(value))throw new Error(`${name} must be an array.`);return value;}
function safeAccount(value){
 if(!object(value))return null;
 const result={};
 if(object(value.summary)){result.summary={};for(const [key,v]of Object.entries(value.summary))if(/^(lifetime_tokens|input_tokens|output_tokens|cached_input_tokens|total_tokens|request_count|requests|cost_usd|total_cost_usd|daily_tokens|today_tokens)$/.test(key)&&typeof v==='number'&&Number.isFinite(v)&&v>=0)result.summary[key]=v;}
 if(Array.isArray(value.daily_buckets))result.daily_buckets=value.daily_buckets.filter(object).map(b=>{const row={};for(const [k,v]of Object.entries(b)){if(['date','timestamp','start_time','end_time'].includes(k)&&(typeof v==='string'||typeof v==='number'))row[k]=v;else if(/^(input_tokens|output_tokens|cached_input_tokens|total_tokens|request_count|requests|cost_usd|total_cost_usd)$/.test(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0)row[k]=v;}return row;});
 return result;
}
export function normalizeDocument(value){
 const input=Array.isArray(value)?{records:value}:value;
 if(!object(input)||!Array.isArray(input.records))throw new Error('Expected a JSON document with records, or an array of records.');
 if(input.schema_version!==undefined&&input.schema_version!==1)throw new Error('Unsupported schema_version; expected 1.');
 const result={schema_version:1,generated_at:input.generated_at?timestamp(input.generated_at,'generated_at'):null,records:unique(input.records.map(record)),quotas:[],balances:[],connections:[]};
 result.quotas=array(input.quotas,'quotas').map(q=>{if(!object(q))throw new Error('Invalid quota.'); const used=amount(q.used_percent,'used_percent');if(used>100)throw new Error('used_percent cannot exceed 100.');return {provider:provider(q.provider),name:string(q.name,'quota name'),used_percent:used,window_minutes:count(q.window_minutes,'window_minutes'),resets_at:timestamp(q.resets_at,'resets_at'),captured_at:timestamp(q.captured_at,'captured_at'),source:string(q.source,'source','snapshot')};});
 result.balances=array(input.balances,'balances').map(b=>({provider:provider(b.provider),currency:string(b.currency,'currency'),total:amount(b.total,'balance total'),granted:amount(b.granted??0,'balance granted'),topped_up:amount(b.topped_up??0,'balance topped_up'),captured_at:timestamp(b.captured_at,'captured_at')}));
 result.connections=array(input.connections,'connections').map(c=>{if(!['connected','import_ready','error'].includes(c.status))throw new Error('Invalid connection status.');return {provider:provider(c.provider),status:c.status,source:string(c.source,'source','Usage import'),detail:typeof c.detail==='string'?c.detail:'',last_sync:c.last_sync?timestamp(c.last_sync,'last_sync'):null};});
 if(object(input.coverage)){result.coverage={};for(const key of ['files_scanned','files_unreadable','malformed_lines','deduplicated_events'])if(own(input.coverage,key))result.coverage[key]=count(input.coverage[key],key);if(input.coverage.last_activity)result.coverage.last_activity=timestamp(input.coverage.last_activity,'last_activity');}
 const account=safeAccount(input.account_usage);if(account)result.account_usage=account;
 if(input.organization_usage!==undefined){const org=input.organization_usage;if(!object(org)||org.provider!=='claude')throw new Error('organization_usage must have Claude scope.');const records=unique(array(org.records,'organization_usage.records').map(record));if(records.some(r=>r.provider!=='claude'))throw new Error('Organization records must be Claude records.');result.organization_usage={provider:'claude',captured_at:timestamp(org.captured_at,'organization_usage.captured_at'),records};}
 if(input.data_mode==='demo'||result.records.some(r=>r.source==='demo')||result.quotas.some(q=>q.source==='demo')||result.connections.some(c=>c.source==='Illustrative demo'))result.data_mode='demo';
 return result;
}
export function parseCsv(text){
 if(typeof text!=='string')throw new Error('CSV must be text.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}else if(c==='"'){if(field||closed)throw new Error('Unexpected CSV quote.');quoted=true;}else if(c===','){row.push(field);field='';closed=false;}else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v!==''))rows.push(row);row=[];field='';closed=false;}else{if(closed)throw new Error('Unexpected text after a CSV quote.');field+=c;}}
 if(quoted)throw new Error('Unclosed CSV quote.');if(field!==''||row.length){row.push(field);rows.push(row);}
 if(!rows.length)throw new Error('CSV is empty.');const headers=rows.shift().map(h=>h.trim());
 if(new Set(headers).size!==headers.length)throw new Error('Duplicate CSV columns.');
 for(const key of ['timestamp','provider','model','input_tokens','output_tokens'])if(!headers.includes(key))throw new Error(`CSV requires ${key}.`);
 const records=rows.map((values,index)=>{if(values.length!==headers.length)throw new Error(`CSV row ${index+2} has ${values.length} fields; expected ${headers.length}.`);const r={};headers.forEach((key,i)=>{if(!COLUMNS.includes(key))return;let v=values[i];if(key.endsWith('_tokens')||key==='cost_usd'){if(v===''){if(key==='cost_usd')r[key]=null;return;}if(!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v))throw new Error(`CSV row ${index+2}: invalid ${key}.`);v=Number(v);}if(v!==''||key==='cost_usd')r[key]=v;});return r;});
 return normalizeDocument(records);
}
export function mergeDocuments(current,incoming){
 const a=normalizeDocument(current),b=normalizeDocument(incoming);
 if(b.data_mode==='demo')a.data_mode='demo';
 const merge=(left,right,key)=>[...new Map([...left,...right].map(item=>[key(item),item])).values()];
 return {...a,generated_at:b.generated_at??a.generated_at,records:unique([...a.records,...b.records]),quotas:merge(a.quotas,b.quotas,q=>`${q.provider}\0${q.name}`),balances:merge(a.balances,b.balances,x=>`${x.provider}\0${x.currency}`),connections:merge(a.connections,b.connections,c=>c.provider),...(b.coverage?{coverage:b.coverage}:{}),...(b.account_usage?{account_usage:b.account_usage}:{}),...(b.organization_usage?{organization_usage:b.organization_usage}:{})};
}
// Fresh local snapshots take precedence for every shared scope. Imported snapshots
// can fill absent scopes, but the UI labels those as historical imported snapshots.
export function mergeLocalDocument(server,imported){
 const fresh=normalizeDocument(server),result=mergeDocuments(imported,fresh);
 result.generated_at=fresh.generated_at;
 return result;
}
export function validateImportDocument(value){
 const normalized=normalizeDocument(value);
 if(normalized.data_mode==='demo'||normalized.organization_usage?.records.some(r=>r.source==='demo'))throw new Error('Illustrative demo exports cannot be imported as actual usage. Use Restore demo to explore sample data.');
 return normalized;
}
export const hongKongDay=value=>new Date(new Date(value).getTime()+8*3600000).toISOString().slice(0,10);
export function filterRecords(records,{provider='all',model='all',range='30',now=new Date()}={}){
 const end=new Date(now).getTime();if(!Number.isFinite(end))throw new Error('Invalid filter now.');
 const n=range==='all'?null:Number(range);if(n!==null&&![7,30,90].includes(n))throw new Error('Invalid date range.');
 const today=hongKongDay(end), start=n===null?null:new Date(Date.parse(`${today}T00:00:00Z`)-(n-1)*86400000).toISOString().slice(0,10);
 return records.filter(r=>(provider==='all'||r.provider===provider)&&(model==='all'||r.model===model)&&Date.parse(r.timestamp)<=end&&(!start||hongKongDay(r.timestamp)>=start));
}
export function summarize(records){
 const result={observations:records.length,input_tokens:0,cached_input_tokens:0,cache_write_input_tokens:0,uncached_input_tokens:0,output_tokens:0,reasoning_output_tokens:0,total_tokens:0,cost_usd:null,known_cost_count:0,cost_coverage:0,cache_read_share:0,daily:[],models:[]};
 const days=new Map(),models=new Map();let dollars=0;
 for(const r of records){for(const key of ['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens'])result[key]+=r[key];if(r.cost_usd!==null){result.known_cost_count++;dollars+=r.cost_usd;}
 const day=hongKongDay(r.timestamp),d=days.get(day)??{day,input_tokens:0,cached_input_tokens:0,uncached_input_tokens:0,output_tokens:0,total_tokens:0};d.input_tokens+=r.input_tokens;d.cached_input_tokens+=r.cached_input_tokens;d.uncached_input_tokens+=r.input_tokens-r.cached_input_tokens;d.output_tokens+=r.output_tokens;d.total_tokens+=r.input_tokens+r.output_tokens;days.set(day,d);
 const key=`${r.provider}\0${r.model}`,m=models.get(key)??{provider:r.provider,model:r.model,observations:0,input_tokens:0,cached_input_tokens:0,output_tokens:0,total_tokens:0,cost_usd:null,known_cost_count:0};m.observations++;m.input_tokens+=r.input_tokens;m.cached_input_tokens+=r.cached_input_tokens;m.output_tokens+=r.output_tokens;m.total_tokens+=r.input_tokens+r.output_tokens;if(r.cost_usd!==null){m.cost_usd=(m.cost_usd??0)+r.cost_usd;m.known_cost_count++;}models.set(key,m);
 }
 result.total_tokens=result.input_tokens+result.output_tokens;result.uncached_input_tokens=result.input_tokens-result.cached_input_tokens;result.cost_usd=result.known_cost_count?dollars:null;result.cost_coverage=records.length?result.known_cost_count/records.length:0;result.cache_read_share=result.input_tokens?result.cached_input_tokens/result.input_tokens:0;result.daily=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));result.models=[...models.values()].map(m=>({...m,share:result.total_tokens?m.total_tokens/result.total_tokens:0,cost_coverage:m.observations?m.known_cost_count/m.observations:0})).sort((a,b)=>b.total_tokens-a.total_tokens);return result;
}
export function toCsv(records){
 const quote=value=>`"${String(value).replaceAll('"','""')}"`;
 const safe=value=>/^[\s]*[=+\-@]/.test(value)||/^[\t\r\n]/.test(value)?`'${value}`:value;
 return [COLUMNS.join(','),...records.map(r=>COLUMNS.map(key=>{const v=r[key];return typeof v==='string'?quote(safe(v)):v===null||v===undefined?'':String(v);}).join(','))].join('\r\n');
}
