export const palette = ['#b5efd5','#f3c989','#92c8fa','#efa6b8','#cab4f2','#90dedb'];
const aliases = {'Turkey':'Türkiye','Korea':'South Korea','USA':'United States','Frankfurt':'Frankfurt am Main','Hạ Long Bay':'Ha Long Bay','München':'Munich','Pasay City':'Manila','Broadway':'Sydney','Circular Quay':'Sydney'};
const countryCities = {
  Thailand:['Bangkok','Pattaya','Koh Larn'],France:['Paris','Versailles'],Belgium:['Brussels'],Netherlands:['Amsterdam'],Germany:['Cologne','Munich','Nordhausen','Frankfurt am Main','Heidelberg'],Poland:['Warsaw','Krakow'],China:['Shanghai'],'South Korea':['Seoul','Incheon','Hongdae','Gangnam'],'Hong Kong':['Hong Kong','Central','Tsim Sha Tsui'],Vietnam:['Hanoi','Ha Long Bay'],Japan:['Tokyo','Osaka','Nikko','Kawagoe'],'Türkiye':['Istanbul','Kayseri'],Australia:['Sydney'],Philippines:['Manila'],'United States':['Los Angeles','Las Vegas','Marina del Rey','Koreatown']
};
const canon = value => aliases[String(value).trim()] || String(value).trim();
const unique = values => [...new Set(values.filter(Boolean).map(canon))];
export function buildHistory(base, seeds, flights, geography, today = new Date().toISOString().slice(0,10)) {
  const map = new Map(seeds.map(t=>[t.id,structuredClone(t)]));
  for(const trip of base.trips || []) {
    const seed=map.get(trip.id);
    map.set(trip.id,{...seed,...trip,countries:unique([...(seed?.countries||[]),...(trip.countries||[])]),cities:unique([...(seed?.cities||[]),...(trip.cities||[])]),pois:[...(seed?.pois||[]),...(trip.pois||[])]});
  }
  const geo={...geography.cities,Osaka:[34.6937,135.5023],Kayseri:[38.7225,35.4875]};
  const countryByCity=Object.fromEntries(Object.entries(countryCities).flatMap(([c,names])=>names.map(n=>[n,c])));
  const countryByName=Object.fromEntries(Object.entries(geography.countries).map(([id,c])=>[c.name,{...c,id}]));
  const trips=[...map.values()].filter(t=>!t.archived&&t.startDate&&t.startDate<=today&&!(t.status||'').includes('キャンセル')).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
  const assigned = new Map();
  for (const f of flights.flights || []) {
    if(f.status!=='flown'||f.date>today)continue;
    // A date discrepancy of one day is permitted only when an endpoint matches a trip's recorded country.
    const candidates=trips.filter(t=>{
      const end=new Date((t.endDate||t.startDate)+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
      return f.date>=t.startDate&&f.date<=end.toISOString().slice(0,10);
    });
    const matched=candidates.length===1?candidates[0]:candidates.find(t=>[flights.airports[f.from]?.country,flights.airports[f.to]?.country].some(c=>(t.countries||[]).includes(c)&&c!=='Japan'));
    if(matched)assigned.set(f.id,matched.id);
  }
  const unresolved = new Set();
  const result=trips.map((t,index)=>{
    let countries=unique(t.countries||[]);
    if(t.id==='australia-2026'||t.id==='demo-australia')countries=unique([...countries,'Australia','Philippines']);
    const cityNames=unique([...(t.cities||[]),...(t.destination?[t.destination]:[]),...(t.pois||[]).filter(p=>p.visited||p.category==='city').map(p=>p.area?.split(',')[0])]);
    if(t.id==='australia-2026'||t.id==='demo-australia')cityNames.push('Sydney','Manila');
    const cities=unique(cityNames).flatMap(name=>{if(!geo[name]){unresolved.add(name);return []}return [{name,lat:geo[name][0],lng:geo[name][1],country:countryByCity[name]||countries[0]}]});
    const air=(flights.flights||[]).filter(f=>assigned.get(f.id)===t.id).map(f=>({...f,kind:'flight',from:flights.airports[f.from],to:flights.airports[f.to],fromCode:f.from,toCode:f.to}));
    const ground=cities.slice(1).map((to,i)=>({id:`${t.id}-city-${i}`,from:cities[i],to,kind:'record',date:t.startDate}));
    return {id:t.id,title:t.title,startDate:t.startDate,endDate:t.endDate,dateLabel:t.dateLabel,destination:t.destination,countries,cities,routes:[...air,...ground],index,color:palette[index%palette.length]};
  });
  return {trips:result,countryByName,unresolved:[...unresolved]};
}
export function aggregate(trips) {
  const countries=new Map(),cities=new Map();
  for(const trip of trips){
    for(const country of new Set(trip.countries)){if(!countries.has(country))countries.set(country,{name:country,trips:[]});countries.get(country).trips.push(trip)}
    for(const city of trip.cities){if(!cities.has(city.name))cities.set(city.name,{...city,trips:[]});const entry=cities.get(city.name);if(!entry.trips.some(t=>t.id===trip.id))entry.trips.push(trip)}
  }
  return {countries:[...countries.values()],cities:[...cities.values()],routes:trips.flatMap(t=>t.routes.map(r=>({...r,trip:t}))),trips};
}
export async function loadHistory() {
  const geography=await fetch('./assets/geography.json').then(r=>r.json());
  let base,source='live';
  try{if(location.hostname==='127.0.0.1'||location.hostname==='localhost')throw Error('Local preview');const r=await fetch('https://trip-plan-sync.masakasakasama-man.workers.dev/state',{signal:AbortSignal.timeout(6000),cache:'no-store'});if(!r.ok)throw Error(r.status);base=await r.json();if(!Array.isArray(base.trips))throw Error('Invalid trips')}
  catch{source='snapshot';base=await fetch('../trip-plan.json').then(r=>r.json())}
  return {...buildHistory(base,window.TRIP_HISTORY_SEED||[],window.FLIGHT_HISTORY_SEED||{},geography),source};
}
