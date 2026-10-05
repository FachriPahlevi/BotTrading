import {test,expect} from '@playwright/test'

test('Lab navigates, validates input and saves a strategy snapshot',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  const schema={label:'BOSWaves draft',params:{almaLen:{type:'integer',default:34,min:5,max:2000}},outputs:['alma','bull_flip','bear_flip','risk']}
  const spec={kind:'boswaves_core',params:{almaLen:34},status:'draft'}
  const indicator={id:'i1',kind:'indicators',name:'BOSWaves draft',builtin:true,archived:false,version:1,version_id:'v1',usage:0,config_hash:'a',spec,versions:[{id:'v1',number:1,config_hash:'a',spec}]}
  const catalog={indicators:[indicator],strategies:[] as unknown[],datasets:[],schemas:{boswaves_core:schema},runs:[],run_count:0,history_bridge_configured:false}
  let saved:Record<string,unknown>|undefined
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    if(path.includes('/src/'))return route.continue()
    if(path==='/api/lab/catalog')return route.fulfill({json:catalog})
    if(path==='/api/lab/items/strategies'){
      saved=route.request().postDataJSON()
      const value={...indicator,...saved,id:'s1',kind:'strategies',builtin:false,version_id:'sv1',versions:[{id:'sv1',number:1,spec:saved!.spec,config_hash:'b'}]}
      catalog.strategies.push(value)
      return route.fulfill({json:value})
    }
    if(path==='/api/account'||path==='/api/market/chart')return route.fulfill({status:503,json:{detail:'Test feed unavailable'}})
    return route.fulfill({json:{signals:[],risk:{},regime:{},news:[],events:[]}})
  })
  await page.route('**/health',r=>r.fulfill({json:{status:'ok'}}))
  await page.goto('/workspace/')
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Buka navigasi'}).click()
  await page.getByRole('link',{name:'Strategy Lab (Backtest)'}).click()
  await expect(page.getByRole('heading',{name:'Strategy & Indicator Lab',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'1. Data historis'}).click()
  await expect(page.getByRole('button',{name:'Ambil histori MT5 M1'})).toBeDisabled()
  await page.getByRole('button',{name:'3. Strategi Trading'}).click()
  await page.getByRole('button',{name:'Isi template BOSWaves draft'}).click()
  await page.getByLabel('Nama',{exact:true}).fill('Metode uji')
  await page.getByRole('button',{name:'Simpan baru'}).click()
  await expect(page.getByRole('status')).toContainText('Berhasil')
  expect(saved?.name).toBe('Metode uji')
  expect((saved?.spec as {indicators:{version_id:string}[]}).indicators[0].version_id).toBe('v1')
  await page.getByRole('button',{name:'4. Backtest & Evaluasi'}).click()
  await expect(page.getByRole('button',{name:'Jalankan backtest'})).toBeDisabled()
  await expect(page.getByText('Belum ada run.')).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy()
  expect(errors).toEqual([])
})
