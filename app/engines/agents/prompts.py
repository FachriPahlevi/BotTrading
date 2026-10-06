PROMPT_VERSION = "v1"

ANALYST_SYSTEM_PROMPT = """Anda adalah analis pasar keuangan kuantitatif dan teknikal profesional.
Tugas Anda: Analisis instrumen pasar berdasarkan data metrik harga nyata yang disediakan.

Prinsip Utama:
1. Status default adalah "WAIT" kecuali ada bukti konfirmasi teknikal yang jelas.
2. DILARANG mengarang angka atau harga. Gunakan HANYA angka harga nyata, level swing, dan ATR yang tertera di konteks.
3. DILARANG membuat klaim fundamental, nama pejabat, yield obligasi, atau jadwal kalender berita fiktif karena belum ada live news feed terhubung.
4. Level Stop Loss (SL) dan Take Profit (TP) wajib terukur dan logis:
   - Untuk bias LONG: Stop Loss harus lebih rendah dari harga Entry, dan TP lebih tinggi dari Entry.
   - Untuk bias SHORT: Stop Loss harus lebih tinggi dari harga Entry, dan TP lebih rendah dari Entry.
5. Jawaban HARUS selalu dalam format raw JSON valid (tanpa markdown backticks, tanpa penjelasan di luar JSON) dalam Bahasa Indonesia.
"""

def build_analysis_user_prompt(
    symbol: str,
    interval: str,
    current_price: float,
    metrics_summary: str,
) -> str:
    """Builds calibrated LLM analysis prompt without hardcoded placeholder prices."""
    return f"""Analisis instrumen: {symbol} (Timeframe: {interval})
Harga Terkini: {current_price}
Ringkasan Metrik Teknikal Nyata:
{metrics_summary}

Berikan output JSON dengan skema persis berikut:
{{
  "bias": "LONG" atau "SHORT" atau "WAIT",
  "confidence": <angka integer antara 0 sampai 100>,
  "key_resistance": "<harga resistance terdekat dari data>",
  "key_support": "<harga support terdekat dari data>",
  "summary": "<ringkasan 1-2 kalimat>",
  "conclusion": "<kesimpulan analisis teknikal berbasis level nyata>",
  "technical": [
    "<poin teknikal 1>",
    "<poin teknikal 2>",
    "<poin teknikal 3>"
  ],
  "rationale": [
    "<alasan 1>",
    "<alasan 2>"
  ],
  "plan": {{
    "direction": "BUY" atau "SELL" atau "WAIT",
    "entry_min": <angka harga entry>,
    "entry_max": <angka harga entry>,
    "stop_loss": <angka harga stop loss>,
    "take_profit_1": <angka target profit 1>,
    "take_profit_2": <angka target profit 2>,
    "trigger": "<kondisi konfirmasi entri>",
    "invalidation": "<kondisi pembatalan skenario>"
  }}
}}"""
