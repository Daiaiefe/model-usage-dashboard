import {normalizeDocument,parseCsv,mergeDocuments,mergeLocalDocument,validateImportDocument,filterRecords,summarize,toCsv,hongKongDay,PROVIDERS} from './data.mjs';
import {createDemo} from './demo.mjs';
const $=id=>document.getElementById(id),names={codex:'Codex',claude:'Claude',deepseek:'DeepSeek'},colors=['#769961','#c38a69','#5f87bc','#adc294','#d7b196','#96b4d4','#c9d4b7'];
const integer=new Intl.NumberFormat('en-US'),compact=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}),usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}),percent=value=>`${(value*100).toFixed(1)}%`;
const dateFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const fullDate=value=>value?`${dateFormat.format(new Date(value))} HKT`:'Unavailable';
const emptyDoc=()=>normalizeDocument([]);
let documentData=emptyDoc(),localData=emptyDoc(),importedData=emptyDoc(),mode='loading',initialized=false,busy=false,provider='all',model='all',range='30',filtered=[],summary=summarize([]),sortedActivity=[],search='',page=1,sortKey='total_tokens',sortDirection=-1;
try{const settings=JSON.parse(localStorage.getItem('meter.preferences')||'{}');if(PROVIDERS.includes(settings.provider)||settings.provider==='all')provider=settings.provider;if(['7','30','90','all'].includes(settings.range))range=settings.range;}catch{}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function setText(id,text){$(id).textContent=text;}
function notice(message,type=''){const node=$('notice');node.hidden=!message;node.className=`notice ${type}`;node.textContent=message;}
function savePreferences(){try{localStorage.setItem('meter.preferences',JSON.stringify({provider,range}));}catch{}}
function providerLabel(p){const label=element('span','provider-label');label.append(element('span',`provider-dot ${p}`),document.createTextNode(names[p]));return label;}
function status(p){return documentData.connections.find(c=>c.provider===p)??{provider:p,status:'import_ready',source:'Usage import',detail:'No account connection snapshot. Import usage or configure local collection.',last_sync:null};}
function importedSnapshot(kind,match){return mode==='import'||mode==='local'&&!localData[kind]?.some(match);}
function statusLabel(c){return mode==='demo'?'Demo':documentData.connections.includes(c)&&importedSnapshot('connections',item=>item.provider===c.provider)?'Imported snapshot':c.status==='connected'?'Connected':c.status==='error'?'Needs attention':'Import ready';}
function download(contents,type,filename){const url=URL.createObjectURL(new Blob([contents],{type}));const link=element('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function openDialog(id){$(id).showModal();}
function buildModels(){
 const previous=model,models=[...new Set(documentData.records.filter(r=>provider==='all'||r.provider===provider).map(r=>r.model))].sort();
 const select=$('model-filter');select.replaceChildren();const all=element('option','', 'All models');all.value='all';select.append(all);
 for(const m of models){const option=element('option','',m);option.value=m;select.append(option);}
 model=models.includes(previous)?previous:'all';select.value=model;
}
function recompute(){
 filtered=filterRecords(documentData.records,{provider,model,range});summary=summarize(filtered);sortedActivity=[...filtered].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));page=1;
 renderMetrics();renderDaily();renderShare();renderModels();renderActivity();
 document.querySelectorAll('[data-provider]').forEach(button=>{const active=button.dataset.provider===provider;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});$('range-filter').value=range;savePreferences();
}
function renderHeader(){
 setText('mode-badge',mode==='demo'?'Demo data':mode==='local'?(importedData.records.length?'Local + imports':'Local data'):mode==='import'?'Imported data':'Loading');$('mode-badge').classList.toggle('demo',mode==='demo');
 setText('sync-note',mode==='demo'?'Illustrative sample data · no live connection':mode==='loading'?'Loading local usage…':`${mode==='import'?'Imported this session':'Last refreshed'} ${fullDate(documentData.generated_at)} · Hong Kong time`);
 setText('data-count',`${integer.format(documentData.records.length)} usage observations · ${new Set(documentData.records.map(r=>r.provider)).size} providers`);
 const c=documentData.coverage;setText('coverage-note',c?`${integer.format(c.files_scanned??0)} files scanned · ${integer.format(c.files_unreadable??0)} unreadable · ${integer.format(c.malformed_lines??0)} malformed lines`:mode==='demo'?'Illustrative data · replace with your own export':'Coverage not supplied by this source');
 $('main').classList.toggle('loading',busy);$('refresh').disabled=busy;$('load-local').disabled=busy;setText('connection-mode',mode==='demo'?'Demo mode · no provider is connected':mode==='import'?'Imports only · browser memory':'Local endpoint: /api/usage');
}
function renderMetrics(){
 setText('metric-total',compact.format(summary.total_tokens));$('metric-total').title=`${integer.format(summary.total_tokens)} tokens`;
 setText('metric-total-detail',`${integer.format(summary.observations)} usage observations`);
 setText('metric-output',compact.format(summary.output_tokens));$('metric-output').title=`${integer.format(summary.output_tokens)} output tokens`;
 setText('metric-output-detail',`${compact.format(summary.input_tokens)} input · reasoning included in output`);
 setText('metric-cache',percent(summary.cache_read_share));setText('metric-cache-detail',`${compact.format(summary.cached_input_tokens)} cache reads / ${compact.format(summary.input_tokens)} input`);
 setText('metric-spend',summary.cost_usd===null?'Unavailable':usd.format(summary.cost_usd));
 setText('metric-spend-detail',summary.known_cost_count===0?'No reported cost data':`${summary.cost_coverage<1?'Partial · ':''}${percent(summary.cost_coverage)} cost coverage · ${integer.format(summary.known_cost_count)} observations`);
}
function renderDaily(){
 const root=$('daily-chart');root.replaceChildren();setText('chart-total',`${compact.format(summary.total_tokens)} tokens in selection`);
 if(!summary.observations){root.append(element('div','chart-empty','No usage in this selection. Try another provider, model, or date range.'));setText('chart-period',range==='all'?'ALL TIME':`${range} DAYS`);return;}
 const maxDay=range==='all'?summary.daily.at(-1).day:hongKongDay(new Date()),count=range==='all'?Math.min(90,Math.max(1,Math.round((Date.parse(`${maxDay}T00:00:00Z`)-Date.parse(`${summary.daily[0].day}T00:00:00Z`))/86400000)+1)):Number(range),dailyMap=new Map(summary.daily.map(day=>[day.day,day]));
 const days=Array.from({length:count},(_,i)=>{const day=new Date(Date.parse(`${maxDay}T00:00:00Z`)-(count-i-1)*86400000).toISOString().slice(0,10);return dailyMap.get(day)??{day,uncached_input_tokens:0,cached_input_tokens:0,output_tokens:0,total_tokens:0};});
 setText('chart-period',`${count} DAYS`);setText('chart-description',range==='all'&&summary.daily[0].day<days[0].day?'Latest 90 calendar days with activity · Hong Kong time':'Daily usage · Hong Kong time');
 const max=Math.max(...days.map(d=>d.total_tokens),1),axis=element('div','y-axis');for(const ratio of [1,.75,.5,.25,0])axis.append(element('span','',compact.format(Math.ceil(max*ratio))));
 const plot=element('div','plot'),grid=element('div','plot-grid');for(let i=0;i<5;i++)grid.append(element('i'));plot.append(grid);
 const interval=count<=7?1:Math.ceil((count-1)/5);
 days.forEach((day,index)=>{const column=element('div','bar-column'),stack=element('div','bar-stack');column.tabIndex=0;column.setAttribute('role','img');column.setAttribute('aria-label',`${day.day}: ${integer.format(day.total_tokens)} total tokens; ${integer.format(day.uncached_input_tokens)} uncached input; ${integer.format(day.cached_input_tokens)} cached input; ${integer.format(day.output_tokens)} output`);stack.style.height=`${day.total_tokens/max*100}%`;
 for(const [key,className]of [['uncached_input_tokens','legend-input'],['cached_input_tokens','legend-cache'],['output_tokens','legend-output']]){const part=element('span',`bar-part ${className}`);part.style.height=`${day.total_tokens?day[key]/day.total_tokens*100:0}%`;stack.append(part);}column.append(stack);
 if(index===0||index===count-1||index%interval===0){const date=new Date(`${day.day}T00:00:00Z`);column.append(element('span','bar-label',date.toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})));}
 const tip=element('span','chart-tooltip');tip.append(element('strong','',day.day),element('div','',`${integer.format(day.total_tokens)} tokens`));column.append(tip);plot.append(column);});root.append(axis,plot);
}
function renderShare(){
 const root=$('share-chart'),legend=$('share-legend');root.replaceChildren();legend.replaceChildren();const top=summary.models.slice(0,5);if(summary.models.length>5)top.push({model:'Other models',share:summary.models.slice(5).reduce((n,m)=>n+m.share,0)});
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 160 160');svg.setAttribute('role','img');svg.setAttribute('aria-label',summary.observations?`${summary.models.length} models share ${integer.format(summary.total_tokens)} tokens`:'No model usage in this selection');
 const circle=(color)=>{const node=document.createElementNS(svg.namespaceURI,'circle');for(const [key,value]of Object.entries({cx:80,cy:80,r:60,fill:'none',stroke:color,'stroke-width':17}))node.setAttribute(key,String(value));return node;};svg.append(circle('#eef2e8'));let offset=0;const circumference=2*Math.PI*60;
 top.forEach((m,i)=>{const segment=circle(colors[i]);segment.setAttribute('stroke-dasharray',`${Math.max(0,m.share*circumference-3)} ${circumference}`);segment.setAttribute('stroke-dashoffset',String(-offset));svg.append(segment);offset+=m.share*circumference;const row=element('div','share-row'),dot=element('span','provider-dot');dot.style.backgroundColor=colors[i];row.append(dot,element('span','model-label',m.model),element('strong','',percent(m.share)));legend.append(row);});
 const center=element('div','donut-center');center.append(element('strong','',compact.format(summary.total_tokens)),element('span','','TOTAL TOKENS'));root.append(svg,center);if(!top.length)legend.append(element('p','account-empty','No model activity yet.'));
}
function emptyRow(body,colspan,message){const tr=element('tr'),td=element('td','empty-cell',message);td.colSpan=colspan;tr.append(td);body.append(tr);}
function renderModels(){
 const body=$('models-body');body.replaceChildren();setText('model-count',`${summary.models.length} ${summary.models.length===1?'model':'models'}`);
 const models=[...summary.models].sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];return typeof av==='string'?sortDirection*av.localeCompare(bv):sortDirection*((av??-1)-(bv??-1));});
 document.querySelectorAll('[data-sort]').forEach(button=>{button.parentElement.removeAttribute('aria-sort');const selected=button.dataset.sort===sortKey;button.querySelector('span').textContent=selected?(sortDirection===-1?'↓':'↑'):'↕';if(selected)button.parentElement.setAttribute('aria-sort',sortDirection===-1?'descending':'ascending');});
 for(const m of models){const tr=element('tr'),name=element('td','model-cell',m.model);name.title=m.model;name.append(element('span','subtext',`${percent(m.share)} of selected tokens`));const p=element('td');p.append(providerLabel(m.provider));tr.append(name,p);for(const key of ['observations','input_tokens','output_tokens','total_tokens'])tr.append(element('td',`numeric ${key==='total_tokens'?'total-cell':''}`,integer.format(m[key])));const cost=element('td','numeric',m.cost_usd===null?'Unavailable':usd.format(m.cost_usd));if(m.cost_usd!==null&&m.cost_coverage<1)cost.append(element('span','subtext',`Partial · ${percent(m.cost_coverage)} covered`));tr.append(cost);body.append(tr);}
 if(!models.length)emptyRow(body,7,'No models match this selection. Import usage or adjust your filters.');
}
function renderActivity(){
 const query=search.toLowerCase().trim(),matches=query?sortedActivity.filter(r=>`${r.model} ${r.provider} ${names[r.provider]}`.toLowerCase().includes(query)):sortedActivity,total=matches.length,pages=Math.max(1,Math.ceil(total/10));page=Math.min(page,pages);const body=$('activity-body');body.replaceChildren();
 for(const r of matches.slice((page-1)*10,page*10)){const tr=element('tr');tr.append(element('td','',fullDate(r.timestamp).replace(' HKT','')),element('td','model-cell',r.model));const p=element('td');p.append(providerLabel(r.provider));tr.append(p,element('td','numeric',integer.format(r.input_tokens)),element('td','numeric',integer.format(r.output_tokens)),element('td','numeric total-cell',integer.format(r.input_tokens+r.output_tokens)),element('td','numeric',r.cost_usd===null?'Unavailable':usd.format(r.cost_usd)));body.append(tr);}
 if(!total)emptyRow(body,7,query?'No activity matches your search.':'No activity in this selection.');setText('activity-count',total?`${integer.format((page-1)*10+1)}–${integer.format(Math.min(page*10,total))} of ${integer.format(total)} observations`:'0 observations');setText('activity-page',`Page ${integer.format(page)} of ${integer.format(pages)}`);$('activity-prev').disabled=page<=1;$('activity-next').disabled=page>=pages;
}
function countdown(value){const ms=Date.parse(value)-Date.now();if(ms<=0)return 'Reset time passed · refresh snapshot';const minutes=Math.ceil(ms/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60;return `Resets in ${days?`${days}d `:''}${hours}h ${rest}m`;}
function renderAccounts(){
 const root=$('accounts');root.replaceChildren();for(const p of PROVIDERS){const card=element('article','account-card'),header=element('div','account-card-header'),label=element('strong');label.append(element('span',`provider-dot ${p}`),document.createTextNode(names[p]));const c=status(p);header.append(label,element('span',`status-pill ${c.status}`,statusLabel(c)));card.append(header);const quotas=documentData.quotas.filter(q=>q.provider===p),balances=documentData.balances.filter(b=>b.provider===p);
  for(const q of quotas){const row=element('div','quota-row'),line=element('div','quota-line');line.append(element('span','',q.name),element('strong','',`${q.used_percent.toFixed(0)}% used`));const track=element('div','progress-track');track.setAttribute('role','progressbar');track.setAttribute('aria-label',`${names[p]} ${q.name}`);track.setAttribute('aria-valuenow',String(q.used_percent));track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');const fill=element('div','progress-fill');fill.style.width=`${q.used_percent}%`;track.append(fill);const reset=element('div','reset-note',countdown(q.resets_at));reset.dataset.reset=q.resets_at;reset.title=`Reset at ${fullDate(q.resets_at)}`;row.append(line,track,reset);if(importedSnapshot('quotas',item=>item.provider===q.provider&&item.name===q.name))row.append(element('div','reset-note',`Imported snapshot · captured ${fullDate(q.captured_at)}`));card.append(row);}
  for(const b of balances){const balance=element('div','balance-number',b.currency==='USD'?usd.format(b.total):integer.format(b.total));balance.append(element('small','',b.currency));card.append(balance,element('div','balance-caption',`${importedSnapshot('balances',item=>item.provider===b.provider&&item.currency===b.currency)?'Imported snapshot · ':''}Available account balance · not spending`));const parts=element('div','balance-parts');parts.append(element('span','',`Granted ${b.currency==='USD'?usd.format(b.granted):b.granted}`),element('span','',`Topped up ${b.currency==='USD'?usd.format(b.topped_up):b.topped_up}`));card.append(parts);}
  if(!quotas.length&&!balances.length)card.append(element('p','account-empty',p==='deepseek'?'No balance snapshot. Add an optional API key to your local server.':'No quota snapshot available. Usage records do not reveal your remaining account allowance.'));
  const captures=[...quotas,...balances].map(q=>q.captured_at).sort();card.append(element('div','account-snapshot',captures.length?`${mode==='demo'?'Demo snapshot':'Captured'} ${fullDate(captures.at(-1))}`:c.last_sync?`Source sync ${fullDate(c.last_sync)}`:'No account snapshot · configure via Connections'));root.append(card);
 }
 renderAccountSummary();renderOrganizationSummary();renderConnections();
}
function renderOrganizationSummary(){
 const organization=documentData.organization_usage,root=$('organization-summary-values');root.replaceChildren();$('organization-summary').hidden=!organization;if(!organization)return;
 const data=summarize(filterRecords(organization.records,{range:'30'}));
 for(const [label,value]of [['Total tokens',data.total_tokens],['Input tokens',data.input_tokens],['Cache reads',data.cached_input_tokens],['Output tokens',data.output_tokens]]){const node=element('div','',label);node.append(element('strong','',integer.format(value)));root.append(node);}
 const models=data.models.map(m=>`${m.model}: ${compact.format(m.total_tokens)}`).join(' · ');setText('organization-summary-detail',`${mode==='import'||mode==='local'&&!localData.organization_usage?'Imported snapshot · ':''}Captured ${fullDate(organization.captured_at)} · ${integer.format(data.observations)} organization reporting buckets. Cache reads are included in input. ${models}`);
}
function renderAccountSummary(){
 const values=documentData.account_usage?.summary??{},buckets=documentData.account_usage?.daily_buckets??[];const root=$('account-summary-values');root.replaceChildren();$('account-summary').hidden=!Object.keys(values).length&&!buckets.length;
 for(const [key,value]of Object.entries(values)){const node=element('div','',key.replaceAll('_',' '));node.append(element('strong','',key.includes('cost')?usd.format(value):integer.format(value)));root.append(node);}if(buckets.length){const node=element('div','','Daily account buckets');node.append(element('strong','',integer.format(buckets.length)));root.append(node);}if(documentData.account_usage){root.append(element('p','',`${mode==='import'||mode==='local'&&!localData.account_usage?'Imported account snapshot':'Account snapshot'} · document captured ${fullDate(mode==='import'||mode==='local'&&!localData.account_usage?importedData.generated_at:documentData.generated_at)}`));}
}
function renderConnections(){
 const root=$('connection-list');root.replaceChildren();for(const p of PROVIDERS){const c=status(p),row=element('article','connection-row'),header=element('header');header.append(providerLabel(p),element('span',`status-pill ${c.status}`,statusLabel(c)));row.append(header,element('p','',`${c.source} · ${c.detail}`));const imports=importedData.records.filter(r=>r.provider===p).length;row.append(element('small','',`${c.last_sync?`Last sync ${fullDate(c.last_sync)}`:'No live sync snapshot'}${imports?` · ${integer.format(imports)} imported observations in memory`:''}`));root.append(row);}
}
function renderAll(){renderHeader();buildModels();recompute();renderAccounts();}
async function loadLocal(initial=false){
 if(busy)return;busy=true;renderHeader();notice('');let unavailable=false;
 try{const response=await fetch('/api/usage',{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok){unavailable=[404,405].includes(response.status);throw new Error(`Local usage endpoint returned HTTP ${response.status}.`);}const incoming=normalizeDocument(await response.json());const combined=mergeLocalDocument(incoming,importedData);localData=incoming;documentData=combined;mode='local';initialized=true;notice(incoming.records.length?'':'Local collection returned no usage observations. Check Connections or import an export.');}
 catch(error){if(initial&&!initialized){if(unavailable||error instanceof TypeError){documentData=createDemo();mode='demo';initialized=true;notice('Local collection is unavailable here. Showing explicitly labeled illustrative demo data. Import your usage or load the local server.');}else{mode='import';initialized=true;notice(`Could not load local usage. ${error.message} You can import a CSV or JSON file.`,'error');}}else notice(`Refresh failed. Your current data and imports are preserved. ${error.message}`,'error');}
 finally{busy=false;renderAll();}
}
async function importFile(file){
 if(!file)return;const error=$('import-error'),success=$('import-success');error.hidden=true;success.hidden=true;$('import-file').disabled=true;
 try{if(file.size>50*1024*1024)throw new Error('Files over 50 MB are not supported. Split the export into smaller files.');const text=await file.text(),incoming=validateImportDocument(/\.csv$/i.test(file.name)||file.type==='text/csv'?parseCsv(text):JSON.parse(text.replace(/^\uFEFF/,'')));const base=mode==='demo'?emptyDoc():documentData,nextImports=mergeDocuments(importedData,incoming),combined=mode==='local'?mergeLocalDocument(localData,nextImports):mergeDocuments(base,incoming),added=combined.records.length-base.records.length;
  // Mutation happens only after every validation and merge succeeds.
  importedData=nextImports;documentData=combined;if(mode!=='local'){documentData.generated_at=new Date().toISOString();mode='import';}initialized=true;notice('');renderAll();success.textContent=`Imported ${integer.format(added)} new observations. ${integer.format(incoming.records.length-added)} identical observations were already present. Data stays in this session.`;success.hidden=false;
 }catch(e){error.textContent=`Import failed. ${e.message} Your current data is preserved.`;error.hidden=false;}finally{$('import-file').disabled=false;$('import-file').value='';}
}
function restoreDemo(){if(busy)return;documentData=createDemo();localData=emptyDoc();importedData=emptyDoc();mode='demo';initialized=true;notice('Illustrative demo restored. Import your data or load the local endpoint to see actual usage.');renderAll();$('connections-dialog').close();}
document.querySelectorAll('[data-provider]').forEach(button=>button.addEventListener('click',()=>{provider=button.dataset.provider;model='all';buildModels();recompute();}));
$('model-filter').addEventListener('change',event=>{model=event.target.value;recompute();});$('range-filter').addEventListener('change',event=>{range=event.target.value;recompute();});
document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{const key=button.dataset.sort;sortDirection=sortKey===key?-sortDirection:key==='model'?1:-1;sortKey=key;renderModels();}));
let searchTimer;$('activity-search').addEventListener('input',event=>{clearTimeout(searchTimer);search=event.target.value;searchTimer=setTimeout(()=>{page=1;renderActivity();},120);});$('activity-prev').addEventListener('click',()=>{page--;renderActivity();});$('activity-next').addEventListener('click',()=>{page++;renderActivity();});
$('import-open').addEventListener('click',()=>{$('import-error').hidden=true;$('import-success').hidden=true;openDialog('import-dialog');});$('import-file').addEventListener('change',event=>importFile(event.target.files[0]));
const drop=$('drop-target');drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');importFile(event.dataTransfer.files[0]);});
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
for(const id of ['connections-open','help-open','demo-open'])$(id).addEventListener('click',()=>openDialog('connections-dialog'));$('restore-demo').addEventListener('click',restoreDemo);$('load-local').addEventListener('click',async()=>{await loadLocal();if(mode==='local')$('connections-dialog').close();});$('refresh').addEventListener('click',()=>loadLocal());
$('export-open').addEventListener('click',()=>{const open=$('export-menu').hidden;$('export-menu').hidden=!open;$('export-open').setAttribute('aria-expanded',String(open));if(open)$('export-csv').focus();});
document.addEventListener('click',event=>{if(!event.target.closest('.export-wrap')){$('export-menu').hidden=true;$('export-open').setAttribute('aria-expanded','false');}});document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('export-menu').hidden=true;$('export-open').setAttribute('aria-expanded','false');}});
function closeExport(){$('export-menu').hidden=true;$('export-open').setAttribute('aria-expanded','false');}
$('export-csv').addEventListener('click',()=>{download(toCsv(filtered),'text/csv;charset=utf-8',`meter-${mode}-${hongKongDay(new Date())}.csv`);closeExport();});$('export-json').addEventListener('click',()=>{const safe=normalizeDocument({...documentData,generated_at:new Date().toISOString()});download(JSON.stringify(safe,null,2),'application/json',`meter-${mode}-${hongKongDay(new Date())}.json`);closeExport();});
$('download-template').addEventListener('click',()=>download(toCsv(normalizeDocument([{id:'example-001',timestamp:new Date().toISOString(),provider:'codex',model:'your-model',input_tokens:100,cached_input_tokens:40,output_tokens:20,cost_usd:null,source:'import'}]).records),'text/csv;charset=utf-8','meter-usage-template.csv'));
document.querySelectorAll('nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('nav a').forEach(item=>item.classList.toggle('active',item===link));document.querySelector('.breadcrumb strong').textContent=link.hash==='#models'?'Models':link.hash==='#activity'?'Activity':'Overview';}));
setInterval(()=>document.querySelectorAll('[data-reset]').forEach(node=>node.textContent=countdown(node.dataset.reset)),60000);
renderHeader();renderMetrics();renderDaily();renderShare();renderModels();renderActivity();renderAccounts();loadLocal(true);
