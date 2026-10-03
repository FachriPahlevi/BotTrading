import pandas as pd

import pandas_ta as ta


def test_pandas_ta_has_required_indicators():
    df = pd.DataFrame(
        {
            "high": [10, 11, 12, 13, 14, 15, 16],
            "low": [9, 10, 11, 12, 13, 14, 15],
            "close": [9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5],
        }
    )

    adx = ta.adx(df["high"], df["low"], df["close"], length=14)
    atr = ta.atr(df["high"], df["low"], df["close"], length=14)
    bbands = ta.bbands(df["close"], length=20, std=2)

    assert set(adx.columns) >= {"ADX_14", "DMP_14", "DMN_14"}
    assert "ATR_14" in atr.columns
    assert set(bbands.columns) >= {"BBL_20_2.0", "BBM_20_2.0", "BBU_20_2.0"}
