import copy
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pandas as pd
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.lab import datasets, service, jobs
from app.lab.models import LabRun, LabVersion
from app.lab.schemas import ImportSource, DatasetInput, RunInput
from app.api import lab
from trading_agent.lab_indicators import compute, parameters, REGISTRY
from trading_agent.lab_rules import signals
from trading_agent.backtest import run_research_backtest


def bars(n=300):
    close = 100 + np.sin(np.arange(n)/5)*3
    return pd.DataFrame(dict(time=1704067200000+np.arange(n)*60000,open=close,high=close+1,low=close-1,close=close,volume=np.ones(n)))


def config():
    return dict(instances=[dict(alias='ma',kind='sma',params={'period':3}),dict(alias='atr',kind='atr',params={'period':2})],
                buy=dict(op='crossover',left='close',right='ma.value'),sell=dict(op='crossunder',left='close',right='ma.value'),
                stop=dict(ref='atr.value',mult=1),target_r=2)


def settings():
    return dict(initial_balance=10000,risk_percent=1,target_trades=100,
                costs=dict(spread=.1,slippage=.02,commission_per_lot=2,contract_size=100,volume_min=.01,volume_step=.01,volume_max=100))


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=patch.object(datasets,'ROOT',Path(self.temp.name));self.root.start()

    def tearDown(self):
        self.root.stop();self.temp.cleanup()

    def test_validation_dedup_closed_and_identity(self):
        source=bars(5)
        source=pd.concat([source,source.iloc[[0]]])
        frame, quality=datasets.parse_csv(source.to_csv(index=False),'1m',datetime.fromtimestamp((1704067200000+4*60000)/1000,timezone.utc))
        self.assertEqual(len(frame),4)
        self.assertEqual(quality,dict(duplicates_replaced=1,open_bars_removed=1))
        identity=dict(broker='Test',server='Test-Demo',symbol='TEST',interval='1m',role='research')
        first=datasets.save_dataset(frame,identity)
        self.assertEqual(first['dataset_id'],datasets.save_dataset(frame,identity)['dataset_id'])
        pd.testing.assert_frame_equal(frame,datasets.load_dataset(first))
        changed=frame.copy();changed.loc[0,'close']+=.0000000001
        self.assertNotEqual(first['dataset_id'],datasets.save_dataset(changed,identity)['dataset_id'])
        self.assertNotEqual(first['dataset_id'],datasets.save_dataset(frame,{**identity,'server':'Another'})['dataset_id'])

    def test_invalid_ohlc_nan_naive_future_rejected(self):
        for column,value in [('high',1),('close',float('inf')),('time',9999999999999)]:
            bad=bars(5);bad.loc[0,column]=value
            with self.assertRaises(ValueError): datasets.parse_csv(bad.to_csv(index=False),'1m')
        bad=bars(5);bad['time']=['2024-01-01 00:00:00']*5
        with self.assertRaises(ValueError): datasets.parse_csv(bad.to_csv(index=False),'1m')

    def test_resample_never_fills_gap(self):
        frame=bars(15).drop(index=2)
        result=datasets.resample(frame,'5m')
        self.assertEqual(len(result),2)
        self.assertEqual(result.iloc[0].time,1704067200000+5*60000)


class NumericalTests(unittest.TestCase):
    def test_causal_prefix_all_indicators(self):
        frame=bars(250)
        for kind in REGISTRY:
            with self.subTest(kind=kind):
                full=compute(frame,kind,{})
                prefix=compute(frame.iloc[:130],kind,{})
                for key in prefix:
                    np.testing.assert_allclose(full[key].iloc[:130],prefix[key],equal_nan=True)

    def test_bollinger_population_and_rsi_flat(self):
        frame=bars(40)
        out=compute(frame,'bbands',{'period':3,'mult':2})
        expected=frame.close.iloc[-3:].mean()+2*frame.close.iloc[-3:].std(ddof=0)
        self.assertAlmostEqual(out['upper'].iloc[-1],expected)
        frame['close']=100
        self.assertEqual(compute(frame,'rsi',{'period':3})['value'].iloc[-1],50)

    def test_warmup_and_bad_parameters(self):
        strategy=config();strategy['instances'][0].update(kind='ema',params={'period':200})
        with self.assertRaises(ValueError): signals(bars(160),strategy)
        for values in ({'period':True},{'period':float('nan')},{'period':1},{'unknown':2}):
            with self.assertRaises(ValueError): parameters('ema',values)

    def test_backtest_repeatable_ledger_costs_and_next_open(self):
        frame=bars(500)
        first=run_research_backtest(frame,config(),settings())
        self.assertEqual(first,run_research_backtest(frame,config(),settings()))
        self.assertEqual(first['status'],'incomplete')
        self.assertGreater(first['total_trades'],0)
        self.assertAlmostEqual(first['final_balance']-10000,sum(t['net_pnl'] for t in first['trades']))
        for trade in first['trades']:
            self.assertEqual(trade['entry_time']-trade['signal_time'],60000)
            self.assertGreater(trade['commission'],0)
            self.assertAlmostEqual(trade['net_pnl'],trade['gross_pnl']-trade['commission'])
        self.assertIsNotNone(first['wilson_95'])

    def test_sl_first_no_future_signal_and_cancel(self):
        frame=bars(10);frame[['open','close']]=100;frame['high']=110;frame['low']=90
        side=np.zeros(10,dtype=int);side[3]=1
        with patch('trading_agent.lab_rules.signals',return_value=(side,np.full(10,2.),2)):
            result=run_research_backtest(frame,config(),settings())
        trade=result['trades'][0]
        self.assertEqual(trade['exit_reason'],'SL_FIRST')
        self.assertEqual(trade['entry_time'],frame.time.iloc[4])
        self.assertLess(trade['net_pnl'],0)
        self.assertEqual(run_research_backtest(bars(600),config(),settings(),lambda _:False)['status'],'cancelled')


class ManagementTests(DatasetTests):
    def setUp(self):
        super().setUp()
        self.engine=create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db=sessionmaker(bind=self.engine)()
        service.seed(self.db)

    def tearDown(self):
        self.db.close();self.engine.dispose();super().tearDown()

    def test_versions_clone_archive_provenance(self):
        a=service.save(self.db,'indicators','Mine',dict(kind='ema',params={'period':20}))
        b=service.save(self.db,'indicators','Mine',dict(kind='ema',params={'period':30}),a['id'])
        self.assertEqual(b['version'],2)
        self.assertEqual(self.db.get(LabVersion,a['version_id']).spec['params']['period'],20)
        lab.archive(a['id'],self.db)
        with self.assertRaises(HTTPException):service.get_version(self.db,a['version_id'])
        lab.archive(a['id'],self.db)
        source=service.SOURCE_PATH.read_text(encoding='utf-8')
        imported=service.import_pine(self.db,ImportSource(name='Source',source=source,author='BOSWaves',license='MPL-2.0',adaptation='boswaves_numeric'))
        changed=service.save(self.db,'indicators','Source',dict(kind='boswaves_core',params={'almaLen':50}),imported['id'])
        self.assertEqual(changed['spec']['source'],source)
        self.assertEqual(changed['spec']['status'],'draft')

    def test_unsupported_source_cannot_run_and_no_forged_verified(self):
        item=service.import_pine(self.db,ImportSource(name='Unknown',source='request.security(foo)',author='Test',license='MPL-2.0'))
        with self.assertRaises(ValueError):service.resolve_instances(self.db,[dict(alias='x',version_id=item['version_id'],params={})])
        with self.assertRaises(ValueError):service.save(self.db,'indicators','Forged',dict(kind='ema',params={},status='verified'))

    def test_dataset_merge_strategy_pin_holdout_and_recovery(self):
        payload=DatasetInput(name='History',broker='Test',server='Test-Demo',symbol='TEST',csv=bars(120).to_csv(index=False))
        d=lab.ingest_dataset(self.db,payload)
        repeated=lab.ingest_dataset(self.db,payload)
        self.assertEqual(d['spec']['dataset_id'],repeated['spec']['dataset_id'])
        self.assertEqual(repeated['spec']['rows'],120)
        cat=lab.catalog(self.db)
        ma=next(i for i in cat['indicators'] if i['spec']['kind']=='sma')
        atr=next(i for i in cat['indicators'] if i['spec']['kind']=='atr')
        cfg=config();cfg.pop('instances');cfg.update(indicators=[dict(alias='ma',version_id=ma['version_id'],params={'period':3}),dict(alias='atr',version_id=atr['version_id'],params={'period':2})],assumptions='Test only')
        strategy=service.save(self.db,'strategies','Method',cfg)
        self.assertEqual(service.save(self.db,'strategies','Method',strategy['spec'],strategy['id'])['version'],1)
        payload.name='Holdout';payload.role='holdout'
        holdout=lab.ingest_dataset(self.db,payload)
        with self.assertRaises(ValueError):lab.ingest_dataset(self.db,payload)
        values=dict(name='Run',strategy_version_id=strategy['version_id'],dataset_version_id=holdout['version_id'],**settings(),research_ack=True)
        with self.assertRaises(HTTPException):lab.create_run(RunInput(**values),self.db)
        values['dataset_version_id']=d['version_id']
        with patch.object(jobs.POOL,'submit') as submit:
            run=lab.create_run(RunInput(**values),self.db)
            submit.assert_called_once()
        persisted=self.db.get(LabRun,run['id'])
        self.assertEqual(persisted.snapshot['dataset_id'],d['spec']['dataset_id'])
        jobs.recover(self.db);self.db.refresh(persisted)
        self.assertEqual(persisted.status,'interrupted')


if __name__=='__main__':unittest.main()
