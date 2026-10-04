import { normalizeDocument, hongKongDay } from './data.mjs';
// Relative calendar dates, fixed seed and fixed values: illustrative, never user data.
export function createDemo(now = new Date()) {
 const today=hongKongDay(now), midnight=Date.parse(`${today}T00:00:00+08:00`), records=[];
 const models={codex:['gpt-5.3-codex','gpt-5.4'],claude:['claude-sonnet-4-6','claude-opus-4-6'],deepseek:['deepseek-chat','deepseek-reasoner']};
 let seed=19371;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let day=29;day>=0;day--)for(const provider of ['codex','claude','deepseek'])for(let event=0;event<3+Math.floor(random()*7);event++){
  const timestamp=new Date(midnight-day*86400000+event*45*60000).toISOString();if(Date.parse(timestamp)>new Date(now).getTime())continue;
  const model=models[provider][Math.floor(random()*2)],input=Math.floor(13000+random()*76000),output=Math.floor(800+random()*7500),cached=Math.floor(input*(.25+random()*.55));
  records.push({id:`demo-${provider}-${day}-${event}`,timestamp,provider,model,input_tokens:input,cached_input_tokens:cached,cache_write_input_tokens:provider==='claude'?Math.floor((input-cached)*.1):0,output_tokens:output,reasoning_output_tokens:model.includes('reasoner')?Math.floor(output*.6):0,cost_usd:event%3===0?Number((input*.000002+output*.000009).toFixed(6)):null,source:'demo'});
 }
 const captured=new Date(now).toISOString();
 return normalizeDocument({schema_version:1,generated_at:captured,records,quotas:[{provider:'codex',name:'5-hour window',used_percent:34,window_minutes:300,resets_at:new Date(new Date(now).getTime()+2.4*3600000).toISOString(),captured_at:captured,source:'demo'},{provider:'codex',name:'Weekly window',used_percent:61,window_minutes:10080,resets_at:new Date(new Date(now).getTime()+3.2*86400000).toISOString(),captured_at:captured,source:'demo'},{provider:'claude',name:'Session window',used_percent:22,window_minutes:300,resets_at:new Date(new Date(now).getTime()+3.1*3600000).toISOString(),captured_at:captured,source:'demo'}],balances:[{provider:'deepseek',currency:'USD',total:18.42,granted:0,topped_up:18.42,captured_at:captured}],connections:['codex','claude','deepseek'].map(provider=>({provider,status:'import_ready',source:'Illustrative demo',detail:'Sample usage and account snapshots. No live provider connection.',last_sync:null}))});
}
