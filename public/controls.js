import { BANDS, formatFrequency } from './radio.js';

export function stepFrequency(hz, place, direction, band) {
  const next = hz + direction * 10 ** place;
  return Number.isSafeInteger(next) && next >= band[1] && next <= band[2] ? next : hz;
}

export function frequencyControl(root, input, getBand) {
  let hz = getBand()[1];
  function update() {
    const band=getBand(),digits=String(Math.floor(band[2]/1e6)).length;
    const value=String(hz).padStart(digits+6,'0');
    input.value=(hz/1e6).toFixed(6);
    root.setAttribute('aria-label',`Frequenza ${input.value} MHz`);
    for(const column of root.querySelectorAll('[data-place]')) {
      const place=Number(column.dataset.place),index=value.length-1-place;
      column.querySelector('output').textContent=value[index];
      for(const button of column.querySelectorAll('button')) button.disabled=stepFrequency(hz,place,Number(button.dataset.direction),band)===hz;
    }
  }
  function build() {
    const band=getBand(),digits=String(Math.floor(band[2]/1e6)).length;
    root.replaceChildren();
    for(let place=digits+5;place>=0;place--) {
      if(place===5) {const dot=document.createElement('span');dot.className='frequency-dot';dot.textContent='.';dot.setAttribute('aria-hidden','true');root.append(dot);}
      const column=document.createElement('div');column.className='frequency-digit';column.dataset.place=place;
      const output=document.createElement('output');
      const buttons=[1,-1].map(direction=>{
        const button=document.createElement('button');button.type='button';button.textContent=direction===1 ? '+' : '−';button.dataset.direction=direction;
        button.setAttribute('aria-label',`${direction===1 ? 'Aumenta' : 'Diminuisci'} di ${formatFrequency(10**place)} MHz`);
        button.addEventListener('click',()=>{hz=stepFrequency(hz,place,direction,getBand());update();});return button;
      });
      column.append(buttons[0],output,buttons[1]);root.append(column);
    }
    update();
  }
  return {setBand(){const b=getBand();if(hz<b[1] || hz>b[2])hz=b[1];build();}};
}

export function bandControl(root,input,onChange,enabled) {
  const height=48;
  let selected=BANDS.findIndex(b=>b[0]===input.value),timer;
  root.replaceChildren(...BANDS.map(([band])=>{const el=document.createElement('div');el.className='band-value';el.textContent=`${band.replace('.',',')} m`;el.setAttribute('aria-hidden','true');return el;}));
  function select(index,scroll=true) {
    selected=Math.max(0,Math.min(BANDS.length-1,index));input.value=BANDS[selected][0];
    root.setAttribute('aria-valuenow',String(selected));root.setAttribute('aria-valuetext',`${input.value} metri`);
    if(scroll)root.scrollTop=selected*height;
    onChange();
  }
  root.addEventListener('scroll',()=>{
    clearTimeout(timer);timer=setTimeout(()=>{
      if(!root.getClientRects().length)return;
      if(!enabled()){root.scrollTop=selected*height;return;}
      const index=Math.round(root.scrollTop/height);if(index!==selected)select(index,false);
    },80);
  });
  root.addEventListener('keydown',event=>{
    if(!enabled())return;
    const moves={ArrowUp:-1,ArrowDown:1,PageUp:-3,PageDown:3};
    if(event.key in moves){event.preventDefault();select(selected+moves[event.key]);}
    else if(event.key==='Home' || event.key==='End'){event.preventDefault();select(event.key==='Home'?0:BANDS.length-1);}
  });
  select(selected);
  return {reveal(){root.scrollTop=selected*height;},selected(){return selected;}};
}
