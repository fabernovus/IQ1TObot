// Stop watching once an accurate fresh fix is available, or after 25 seconds.
export function preciseGPS(geo=navigator.geolocation, timeout=25000) {
  return new Promise((resolve,reject)=>{
    if(!geo)return reject(new Error('GPS non disponibile su questo dispositivo.'));
    let best=null,watch,timer,done=false;
    const finish=(error)=>{
      if(done)return;done=true;clearTimeout(timer);if(watch!==undefined)geo.clearWatch(watch);
      if(best)resolve(best);else reject(error || new Error('Nessuna posizione GPS recente disponibile. Riprova all’aperto.'));
    };
    timer=setTimeout(()=>finish(),timeout);
    try {watch=geo.watchPosition(p=>{
      if(done || !Number.isFinite(p.timestamp) || Date.now()-p.timestamp>10000)return;
      const c=p.coords;
      if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy<=0)return;
      if(!best || c.accuracy<best.accuracy)best={latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy};
      if(c.accuracy<=30)finish();
    },error=>{
      if(error.code===1)finish(new Error('Consenti la posizione precisa a Telegram nelle impostazioni del dispositivo.'));
      // A transient error can be followed by a better fix before our deadline.
    },{enableHighAccuracy:true,maximumAge:0,timeout});}
    catch {finish(new Error('Accesso GPS non disponibile. Controlla i permessi di posizione.'));}
    if(done && watch!==undefined)geo.clearWatch(watch);
  });
}
