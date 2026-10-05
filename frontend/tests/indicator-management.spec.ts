import {test,expect} from '@playwright/test'

test('indicator manager edits source and dashboard configures favorites and inputs',async({page},info)=>{
  const emaSchema={label:'EMA',params:{period:{type:'integer',default:20,min:2,max:2000}},outputs:['value']}
  const emaSpec={kind:'ema',params:{period:20},status:'builtin',description:'EMA bawaan'}
  const sourceSpec={kind:'source_only',params:{},status:'unsupported',source:'//@version=6\nindicator("Custom")',description:'Source review',provenance:{author:'Tester',license:'MPL-2.0',source_hash:'abc'}}
  const ema={id:'ema-id',kind:'indicators',name:'EMA',builtin:true,archived:false,version:1,version_id:'ema-v1',usage:0,config_hash:'a',spec:emaSpec,versions:[{id:'ema-v1',number:1,config_hash:'a',spec:emaSpec,created_at:new Date().toISOString()}]}
  const custom={id:'custom-id',kind:'indicators',name:'Custom Pine',builtin:false,archived:false,version:1,version_id:'custom-v1',usage:0,config_hash:'b',spec:sourceSpec,versions:[{id:'custom-v1',number:1,config_hash:'b',spec:sourceSpec,created_at:new Date().toISOString()}]}
  const catalog={indicators:[ema,custom],strategies:[],datasets:[],schemas:{ema:emaSchema},runs:[],run_count:0,history_bridge_configured:false}
  let editedSource='',latestPeriod=0
  const candles=Array.from({length:80},(_,index)=>({time:1704067200000+index*3600000,open:2000+index,high:2002+index,low:1999+index,close:2001+index,volume:100}))
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname
    if(path.includes('/src/'))return route.continue()
    if(path==='/api/lab/catalog')return route.fulfill({json:catalog})
    if(path==='/api/lab/indicators/custom-id/source'){
      const body=route.request().postDataJSON();editedSource=body.source
      return route.fulfill({json:{...custom,version:2,version_id:'custom-v2',spec:{...sourceSpec,source:body.source},versions:custom.versions}})
    }
    if(path==='/api/lab/indicators/calculate'){
      const body=route.request().postDataJSON();latestPeriod=body.indicators[0]?.params.period??0
      return route.fulfill({json:{lines:{'ema1.value':candles.map((bar,index)=>index<59?null:bar.close)},instances:[{alias:'ema1',kind:'ema',status:'builtin'}],warmup_bars:61,ready:true,candles:80,symbol:'XAUUSDm',interval:'1h',note:'Valid setelah warm-up 61 candle tertutup.'}})
    }
    if(path==='/api/market/chart')return route.fulfill({json:{symbol:'XAUUSDm',interval:'1h',provider:'test',updated_at:new Date().toISOString(),candles}})
    if(path==='/api/account')return route.fulfill({status:503,json:{detail:'No account in UI test'}})
    if(path==='/api/dashboard/summary')return route.fulfill({json:{signals:[],risk:{},regime:{},news:[],events:[]}})
    if(path==='/api/diagnostics')return route.fulfill({json:{events:[],markets:[]}})
    return route.fulfill({json:{}})
  })
  await page.route('**/health',route=>route.fulfill({json:{status:'ok'}}))
  await page.goto('/workspace/')
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Buka navigasi'}).click()
  await page.getByRole('link',{name:'Manajemen indikator'}).click()
  await expect(page.getByRole('heading',{name:'Manajemen indikator'})).toBeVisible()
  await page.getByRole('button',{name:/Custom Pine/}).click()
  const editor=page.getByLabel('Source Pine')
  await expect(editor).toContainText('indicator("Custom")')
  await editor.fill('//@version=6\nindicator("Edited")')
  await page.getByRole('button',{name:'Simpan versi script'}).click()
  await expect.poll(()=>editedSource).toContain('Edited')

  if(info.project.name==='mobile')await page.getByRole('button',{name:'Buka navigasi'}).click()
  await page.getByRole('link',{name:'Trading workspace',exact:true}).click()
  await expect(page.getByTestId('market-chart')).toBeVisible()
  await page.getByRole('button',{name:/Indikator/}).click()
  await page.getByRole('button',{name:'Tambah EMA dari favorit'}).click()
  await page.getByRole('button',{name:'Tambah',exact:true}).click()
  await page.getByLabel('period').fill('30')
  await expect.poll(()=>latestPeriod).toBe(30)
  await page.getByRole('button',{name:'Close'}).click()
  await expect(page.getByRole('button',{name:'EMA',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurum.indicator.favorites')??'[]'))).toContain('ema-id')
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('aurum.chart.indicators')??'[]')[0].params.period)).toBe(30)
})
