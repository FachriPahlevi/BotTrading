import pandas as pd
candles = []
for i in range(100):
    candles.append({"time": i, "open": 100+i, "high": 100+i, "low": 100+i, "close": 100+i})

frame = pd.DataFrame(candles)
delta = frame.close.diff()
gains = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
losses = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
rs = gains / losses.replace(0, float("nan"))
frame["rsi_14"] = 100 - (100 / (1 + rs))
frame.loc[(losses == 0) & (gains > 0), "rsi_14"] = 100
frame.loc[(losses == 0) & (gains == 0), "rsi_14"] = 50
frame["rsi_14"] = frame["rsi_14"].fillna(50)

print("RSI calc:", frame["rsi_14"].iloc[-1])
