window.GC=(function(){
  const firebaseConfig={
    apiKey:"AIzaSyAhnmtS3glZ4nblArjJix67o-mVu6h7Ehc",
    authDomain:"out-the-gc-929b1.firebaseapp.com",
    projectId:"out-the-gc-929b1",
    storageBucket:"out-the-gc-929b1.firebasestorage.app",
    messagingSenderId:"910472157095",
    appId:"1:910472157095:web:929ed62214747ce18f4882"
  };
  const NOT_CONFIGURED=firebaseConfig.apiKey==="PASTE_YOUR_API_KEY";
  let db=null,docRef=null;
  if(!NOT_CONFIGURED){
    firebase.initializeApp(firebaseConfig);
    db=firebase.firestore();
    docRef=db.collection('outthegc').doc('shared');
  }

  const PALETTE=['#6c7bff','#ff6b6b','#4ade80','#ffc857','#c084fc','#38bdf8','#fb923c','#f472b6'];
  const CAPE_TOWN={lat:-33.9249,lon:18.4241};
  const WEATHER_URL='https://api.open-meteo.com/v1/forecast?latitude='+CAPE_TOWN.lat+'&longitude='+CAPE_TOWN.lon
    +'&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,cloud_cover_mean'
    +'&timezone=Africa/Johannesburg&forecast_days=16';
  const SEASONAL_WEATHER_URL='https://seasonal-api.open-meteo.com/v1/seasonal?latitude='+CAPE_TOWN.lat+'&longitude='+CAPE_TOWN.lon
    +'&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max,cloud_cover_mean'
    +'&timezone=Africa/Johannesburg&forecast_days=92';
  const GOOD_WEATHER_THRESHOLD=65;
  const ME_KEY='gc-my-person-id';

  let data={people:[],blocks:[],availability:[],plan:null,gifts:[]};
  let myId=null;
  let weatherData=null;
  let listeners=[];

  // Utilities
  const uid=()=>(crypto.randomUUID?crypto.randomUUID():'id-'+Math.random().toString(36).slice(2)+Date.now());
  function colorFor(i){return PALETTE[i%PALETTE.length];}
  function isAdmin(p){return p&&(p.isAdmin===true||p.name==='Malika');}
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // Date helpers
  function startOfDay(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
  function fmtDayLabel(d,todayBase){
    const diff=Math.round((startOfDay(d)-todayBase)/86400000);
    if(diff===0)return 'Today';
    if(diff===1)return 'Tomorrow';
    return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  }
  function toWeatherDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function toLocalInputDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

  // Weather
  async function fetchWeather(){
    try{
      const[stdResp,seasResp]=await Promise.all([fetch(WEATHER_URL),fetch(SEASONAL_WEATHER_URL)]);
      const std=stdResp.ok?await stdResp.json():null;
      const seas=seasResp.ok?await seasResp.json():null;
      if(!std&&!seas)throw new Error('Both weather APIs failed');
      if(std&&!seas){weatherData=std;}
      else if(seas&&!std){weatherData=seas;}
      else{
        const VK=['time','temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','weather_code','wind_speed_10m_max','cloud_cover_mean'];
        const merged={daily:{}};
        VK.forEach(k=>merged.daily[k]=[]);
        const stdSet=new Set(std.daily.time);
        std.daily.time.forEach((date,i)=>{VK.forEach(k=>merged.daily[k].push(std.daily[k][i]));});
        seas.daily.time.forEach((date,i)=>{
          if(!stdSet.has(date)){
            VK.forEach(k=>{
              const v=seas.daily[k]?seas.daily[k][i]:null;
              merged.daily[k].push(k==='precipitation_probability_max'?(v||0):v);
            });
          }
        });
        weatherData=merged;
      }
      notifyListeners();
    }catch(e){console.error('weather fetch failed',e);}
  }
  function weatherEmoji(code){
    const m={0:'\u2600\ufe0f',1:'\ud83c\udf24\ufe0f',2:'\u26c5',3:'\u2601\ufe0f',45:'\ud83c\udf2b\ufe0f',48:'\ud83c\udf2b\ufe0f',51:'\ud83c\udf26\ufe0f',53:'\ud83c\udf26\ufe0f',55:'\ud83c\udf27\ufe0f',56:'\ud83c\udf27\ufe0f',57:'\ud83c\udf27\ufe0f',61:'\ud83c\udf26\ufe0f',63:'\ud83c\udf27\ufe0f',65:'\ud83c\udf27\ufe0f',66:'\ud83c\udf27\ufe0f',67:'\ud83c\udf27\ufe0f',71:'\ud83c\udf28\ufe0f',73:'\ud83c\udf28\ufe0f',75:'\u2744\ufe0f',77:'\ud83c\udf28\ufe0f',80:'\ud83c\udf26\ufe0f',81:'\ud83c\udf27\ufe0f',82:'\u26c8\ufe0f',85:'\ud83c\udf28\ufe0f',86:'\u2744\ufe0f',95:'\u26c8\ufe0f',96:'\u26c8\ufe0f',99:'\u26c8\ufe0f'};
    return m[code]||'\ud83c\udf24\ufe0f';
  }
  function weatherDesc(code){
    const m={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Foggy',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Light showers',81:'Showers',82:'Heavy showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
    return m[code]||'Unknown';
  }
  function getWeatherForDate(dateStr){
    if(!weatherData||!weatherData.daily||!weatherData.daily.time)return null;
    const idx=weatherData.daily.time.indexOf(dateStr);
    if(idx===-1)return null;
    return{
      tempMax:weatherData.daily.temperature_2m_max[idx],
      tempMin:weatherData.daily.temperature_2m_min[idx],
      precip:weatherData.daily.precipitation_sum[idx],
      precipProb:weatherData.daily.precipitation_probability_max[idx],
      code:weatherData.daily.weather_code[idx],
      wind:weatherData.daily.wind_speed_10m_max[idx],
      cloud:weatherData.daily.cloud_cover_mean[idx]
    };
  }

  // Availability
  function isAvailable(personId,dateStr){return data.availability.some(a=>a.personId===personId&&a.date===dateStr);}
  function availableCount(dateStr){return data.people.filter(p=>isAvailable(p.id,dateStr)).length;}

  // Data sync
  function notifyListeners(){listeners.forEach(fn=>fn());}
  async function savePeople(){try{await docRef.set({people:data.people},{merge:true});}catch(e){console.error('save failed',e);alert('Could not save \u2014 check your internet connection.');}}
  async function savePlan(){try{await docRef.set({plan:data.plan},{merge:true});}catch(e){console.error('save plan failed',e);alert('Could not save \u2014 check your internet connection.');}}
  async function saveGifts(){try{await docRef.set({gifts:data.gifts},{merge:true});}catch(e){console.error('save gifts failed',e);alert('Could not save \u2014 check your internet connection.');}}
  function loadMyId(){return localStorage.getItem(ME_KEY)||null;}
  function saveMyId(id){if(id)localStorage.setItem(ME_KEY,id);else localStorage.removeItem(ME_KEY);}
  function subscribeToData(callback){
    listeners.push(callback);
    if(NOT_CONFIGURED){callback();return;}
    docRef.onSnapshot(snap=>{
      if(snap.exists){
        const d=snap.data();
        data={people:d.people||[],blocks:d.blocks||[],availability:d.availability||[],plan:d.plan||null,gifts:d.gifts||[]};
      }else{
        data={people:[],blocks:[],availability:[],plan:null,gifts:[]};
      }
      notifyListeners();
    },err=>{
      console.error('snapshot error',err);
      document.getElementById('app').innerHTML='<div style="padding:40px 20px;text-align:center;color:var(--text-dim);font-size:14px;">Could not connect to the shared calendar. Check your Firestore security rules allow read/write.</div>';
    });
  }

  // Setup gate
  function renderSetup(container,onReady){
    const existing=data.people;
    container.innerHTML=
      '<div id="setup"><div class="setup-card">'+
      '<h2>out the <span style="color:var(--accent)">gc</span></h2>'+
      '<p>Find the best day for a family day in Cape Town \u2014 with weather forecasts and everyone\u2019s availability.</p>'+
      (existing.length?
        '<label class="field-label">Already in the crew</label>'+
        '<div class="existing-people">'+
        existing.map(p=>'<div class="person-pick" data-id="'+p.id+'"><span class="dot" style="background:'+p.color+'"></span>'+escapeHtml(p.name)+'</div>').join('')+
        '</div>':'')+
      '<label class="field-label">Or add yourself</label>'+
      '<input type="text" id="new-name" placeholder="Your name" maxlength="24">'+
      '<button class="btn-primary" id="join-btn">Join the crew</button>'+
      '</div></div>';

    container.querySelectorAll('.person-pick').forEach(el=>{
      el.addEventListener('click',()=>{
        const personId=el.getAttribute('data-id');
        const person=data.people.find(p=>p.id===personId);
        if(isAdmin(person)){
          const pwd=prompt('Enter admin password to switch to this account:');
          if(pwd!=='Admin')return;
        }
        myId=personId;
        saveMyId(myId);
        onReady();
      });
    });
    document.getElementById('join-btn').addEventListener('click',async()=>{
      const input=document.getElementById('new-name');
      const name=input.value.trim();
      if(!name){input.focus();return;}
      const dupe=data.people.find(p=>p.name.toLowerCase()===name.toLowerCase());
      if(dupe){alert('"'+name+'" is already in the crew! Tap the name above to continue as them.');return;}
      const p={id:uid(),name,color:colorFor(data.people.length),isAdmin:name==='Malika'};
      data.people.push(p);
      await savePeople();
      myId=p.id;
      saveMyId(myId);
      onReady();
    });
    document.getElementById('new-name').addEventListener('keydown',e=>{
      if(e.key==='Enter')document.getElementById('join-btn').click();
    });
  }

  return{
    db,docRef,NOT_CONFIGURED,PALETTE,GOOD_WEATHER_THRESHOLD,
    get data(){return data;},set data(v){data=v;},
    get myId(){return myId;},set myId(v){myId=v;},
    get weatherData(){return weatherData;},
    uid,colorFor,isAdmin,escapeHtml,
    startOfDay,addDays,fmtDayLabel,toWeatherDateStr,toLocalInputDate,
    fetchWeather,weatherEmoji,weatherDesc,getWeatherForDate,
    isAvailable,availableCount,
    savePeople,savePlan,saveGifts,loadMyId,saveMyId,subscribeToData,
    renderSetup
  };
})();
