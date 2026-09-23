import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, BAND_PLAN, EXCLUDED_RANGES, isFrequencyAllowed, bandPlanMatches, validateSpot } from '../public/radio.js';
import { stepFrequency } from '../public/controls.js';

const spot=(band,frequency)=>({callsign:'IU1ABC',locator:'JN35UC',mode:'FM',band,frequency});
test('Italian terrestrial allocations: 70 cm and 23 cm gaps, unknown and invalid frequencies',()=>{
  for(const [band,hz,allowed] of [
    ['0.70',433999999,true],['0.70',434000000,false],['0.70',434500000,false],['0.70',435000000,true],
    ['0.23',1244999999,true],['0.23',1245000000,false],['0.23',1268000000,false],
    ['0.23',1270000000,true],['0.23',1297999999,true],['0.23',1299000000,false],
    ['160',1820000,false],['160',1840000,true],['4',70200000,false],['unknown',0,false],['2',NaN,false]
  ])assert.equal(isFrequencyAllowed(band,hz),allowed,`${band} / ${hz}`);
  for(const [band,frequency] of [['0.70','434.5'],['0.23','1250'],['0.23','1268'],['0.23','1299']])assert.throws(()=>validateSpot(spot(band,frequency)));
  assert.equal(validateSpot(spot('0.23','1296.2')).frequency_hz,1296200000);
});
test('frequency stepping skips whole gaps in both directions, including 1 Hz steps',()=>{
  for(const gap of EXCLUDED_RANGES){
    const band=BANDS.find(item=>item[0]===gap.band);
    assert.equal(stepFrequency(gap.from-1,0,1,band),gap.to);
    assert.equal(stepFrequency(gap.to,0,-1,band),gap.from-1);
    assert.equal(stepFrequency(gap.from-1000,3,1,band),gap.to);
  }
});
test('suggested windows never cross a national exclusion',()=>{
  for(const plan of BAND_PLAN)for(const segment of plan.segments){
    assert.ok(segment.from<=segment.to);
    for(const gap of EXCLUDED_RANGES.filter(item=>item.band===plan.band)){
      assert.ok(segment.to<=gap.from || segment.from>=gap.to,`${plan.band}: ${segment.label}`);
    }
  }
});
test('HF CW, beacon reservations and 60m narrow tail are not broad voice/digital suggestions',()=>{
  assert.equal(bandPlanMatches('30','Fonia').length,0);
  assert.ok(bandPlanMatches('30','FT8').every(segment=>segment.from>=10130000));
  assert.ok(bandPlanMatches('60','SSB').every(segment=>segment.to<=5366000));
  for(const [band,from,to] of [['20',14099000,14101000],['17',18109000,18111000],['15',21149000,21151000],['12',24929000,24931000]]){
    for(const mode of ['FT8','DMR','SSB','CW'])assert.ok(bandPlanMatches(band,mode).every(segment=>segment.to<=from || segment.from>=to));
  }
});
test('APRS and satellite-only rows are not generic digital voice recommendations',()=>{
  for(const mode of ['DMR','FT8','FT4','RTTY','PSK31','JS8'])assert.ok(bandPlanMatches('2',mode).every(segment=>segment.from!==144800000 && segment.to<=145800000));
  assert.ok(bandPlanMatches('0.70','DMR').every(segment=>segment.to<=434000000));
  assert.equal(bandPlanMatches('4','FM').length,0);
});
