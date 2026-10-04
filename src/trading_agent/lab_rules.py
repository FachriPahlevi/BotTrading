"""Closed-bar, declarative rules. No dynamic code evaluation."""
import numpy as np
import pandas as pd
from trading_agent.lab_indicators import compute, warmup, parameters, REGISTRY


def evaluate_indicators(frame, instances):
    outputs = {key: frame[key] for key in ('open', 'high', 'low', 'close', 'volume')}
    required = 2
    for instance in instances:
        key, kind, values = instance['alias'], instance['kind'], instance['params']
        if key in outputs or any(name.startswith(key+'.') for name in outputs):
            raise ValueError('Alias indikator harus unik.')
        p = parameters(kind, values)
        required = max(required, warmup(kind, p))
        outputs.update({f'{key}.{name}': series for name, series in compute(frame, kind, p).items()})
    return outputs, required


def rule(node, outputs, index, depth=0):
    if not isinstance(node, dict) or depth > 6:
        raise ValueError('Struktur aturan tidak valid atau terlalu dalam.')
    op = node.get('op')
    if op in ('all', 'any'):
        if set(node) != {'op', 'rules'} or not isinstance(node['rules'], list) or not 1 <= len(node['rules']) <= 12:
            raise ValueError('Aturan gabungan membutuhkan 1–12 kondisi.')
        series = [rule(child, outputs, index, depth+1) for child in node['rules']]
        result = series[0]
        for other in series[1:]:
            result = result & other if op == 'all' else result | other
        return result
    if op not in ('gt', 'lt', 'crossover', 'crossunder') or set(node) != {'op', 'left', 'right'}:
        raise ValueError('Operator didukung: gt, lt, crossover, crossunder, all, any.')
    def value(ref):
        if isinstance(ref, (int, float)) and not isinstance(ref, bool) and np.isfinite(ref):
            return pd.Series(float(ref), index=index)
        if isinstance(ref, str) and ref in outputs:
            return outputs[ref]
        raise ValueError('Referensi output indikator tidak ditemukan.')
    left, right = value(node['left']), value(node['right'])
    if op == 'gt': return left > right
    if op == 'lt': return left < right
    if op == 'crossover': return (left > right) & (left.shift(1) <= right.shift(1))
    return (left < right) & (left.shift(1) >= right.shift(1))


def validate_rules(config):
    refs = {key: pd.Series([1., 2.]) for key in ('open', 'high', 'low', 'close', 'volume')}
    for i in config['instances']:
        parameters(i['kind'], i['params'])
        refs.update({i['alias']+'.'+name: pd.Series([1., 2.]) for name in REGISTRY[i['kind']]['outputs']})
    for side in ('buy', 'sell'):
        rule(config[side], refs, pd.RangeIndex(2))
    stop = config['stop']
    if set(stop) != {'ref', 'mult'} or stop['ref'] not in refs:
        raise ValueError('Stop membutuhkan ref output indikator dan mult positif.')
    if isinstance(stop['mult'], bool) or not isinstance(stop['mult'], (int, float)) or not np.isfinite(stop['mult']) or not 0 < stop['mult'] <= 20:
        raise ValueError('Multiplier stop harus >0 dan <=20.')


def signals(frame, config):
    outputs, required = evaluate_indicators(frame, config['instances'])
    if len(frame) <= required:
        raise ValueError(f'Butuh lebih dari {required} candle tertutup; tersedia {len(frame)}.')
    buy, sell = rule(config['buy'], outputs, frame.index), rule(config['sell'], outputs, frame.index)
    side = np.where(buy & ~sell, 1, np.where(sell & ~buy, -1, 0))
    side[:required] = 0
    risk = outputs[config['stop']['ref']].to_numpy()*config['stop']['mult']
    side[~np.isfinite(risk) | (risk <= 0)] = 0
    return side, risk, required
